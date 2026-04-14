#!/usr/bin/env python3
"""MFP API server using the mobile OAuth flow — no cookies, no captcha."""

import json
import uuid
import time
import base64
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, urlparse, parse_qs

import requests
import jwt  # PyJWT

# MFP mobile app credentials (public, from the mobile app)
CLIENT_ID = "1c70aed5-15c7-40a2-b4f0-a55ed1a5c43c"
CLIENT_SECRET = "7xilqzoa2lqngjgi7vilqaqygq64cgbmc7pmsf4onvfelatb6vla"

IDENTITY_URL = "https://identity-api.myfitnesspal.com"
API_URL = "https://api.myfitnesspal.com"
USER_AGENT = "MyFitnessPal/25.19.0 (mfp-mobile-android-google) (Android 11; Pixel 5 / Android Android SDK built for arm64) (preload=false;locale=en_US)"
API_VERSION = "2.0.50"

DEVICE_ID = str(uuid.uuid4())


def standard_headers(session_token=None, domain_user_id=None):
    h = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "device_id": DEVICE_ID,
        "mfp-device-id": DEVICE_ID,
        "mfp-client-id": "mfp-mobile-android-google",
        "api-version": API_VERSION,
        "accept-language": "en-US",
    }
    if session_token:
        h["Authorization"] = f"Bearer {session_token}"
    if domain_user_id:
        h["mfp-user-id"] = domain_user_id
    return h


def get_client_token():
    """Get OAuth client credentials token."""
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
    }
    headers = standard_headers()
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    resp = requests.post(f"{IDENTITY_URL}/oauth/token", data=data, headers=headers)
    resp.raise_for_status()
    return resp.json()


def get_signing_key(client_token):
    """Get the HS512 signing key from MFP."""
    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    headers = standard_headers()
    headers["Authorization"] = f"Basic {auth}"
    resp = requests.get(f"{IDENTITY_URL}/clientKeys", headers=headers)
    resp.raise_for_status()
    keys = resp.json().get("_embedded", {}).get("clientKeys", [])
    for key_entry in keys:
        k = key_entry.get("key", {})
        if k.get("use") == "sig" and k.get("alg") == "HS512":
            raw = base64.urlsafe_b64decode(k["k"] + "==")
            return raw, k["kid"]
    raise Exception("No HS512 signing key found")


def login(username, password):
    """Full OAuth login flow returning access_token, refresh_token, and user info."""
    # Step 1: Client credentials token
    client_token = get_client_token()

    # Step 2: Get signing key
    signing_key, kid = get_signing_key(client_token)

    # Step 3: Create JWT with credentials
    payload = {"username": username, "password": password}
    token = jwt.encode(payload, signing_key, algorithm="HS512", headers={"kid": kid})

    # Step 4: Authorize (get auth code via redirect)
    data = {
        "client_id": CLIENT_ID,
        "credentials": token,
        "nonce": str(time.time_ns()),
        "redirect_uri": "mfp://identity/callback",
        "response_type": "code",
        "scope": "openid",
    }
    headers = standard_headers(session_token=client_token["access_token"])
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    resp = requests.post(
        f"{IDENTITY_URL}/oauth/authorize",
        data=data,
        headers=headers,
        allow_redirects=False,
    )

    location = resp.headers.get("Location", "")
    if not location:
        # Check if there's an error in the response
        try:
            error_body = resp.json()
            error_msg = error_body.get("error_description", error_body.get("error", "Login failed"))
        except Exception:
            error_msg = f"Login failed (status {resp.status_code})"
        return {"error": error_msg}

    parsed = urlparse(location)
    code = parse_qs(parsed.query).get("code", [None])[0]
    if not code:
        return {"error": "No authorization code in redirect"}

    # Step 5: Exchange code for tokens
    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": "mfp://identity/callback",
    }
    headers = standard_headers()
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    token_resp = requests.post(f"{IDENTITY_URL}/oauth/token", data=token_data, headers=headers)
    if token_resp.status_code != 200:
        return {"error": f"Token exchange failed (status {token_resp.status_code})"}

    tokens = token_resp.json()

    # Step 6: Get user info to find domain_user_id
    user_headers = standard_headers(session_token=tokens["access_token"])
    user_resp = requests.get(f"{IDENTITY_URL}/users/me", headers=user_headers)
    
    domain_user_id = None
    user_email = username
    display_name = username
    if user_resp.ok:
        user_data = user_resp.json()
        for link in user_data.get("accountLinks", []):
            if link.get("domain") == "MFP":
                domain_user_id = link.get("domainUserId")
                break
        emails = user_data.get("profileEmails", {}).get("emails", [])
        if emails:
            user_email = emails[0].get("email", username)
        profile = user_data.get("profile", {})
        display_name = profile.get("displayName") or profile.get("firstName") or user_email

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "domain_user_id": domain_user_id,
        "display_name": display_name,
        "email": user_email,
        "expires_in": tokens.get("expires_in", 3600),
    }


def refresh_token(refresh_tok):
    """Refresh an expired access token."""
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_tok,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    headers = standard_headers()
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    resp = requests.post(f"{IDENTITY_URL}/oauth/token", data=data, headers=headers)
    if resp.status_code != 200:
        return {"error": "Token refresh failed — please log in again"}
    tokens = resp.json()
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", refresh_tok),
        "expires_in": tokens.get("expires_in", 3600),
    }


def fetch_diary(access_token, domain_user_id, date_str):
    """Fetch food diary for a specific date using the MFP API."""
    headers = standard_headers(session_token=access_token, domain_user_id=domain_user_id)
    
    # The MFP API diary endpoint
    params = {
        "entry_date": date_str,
        "types[]": "food_entry",
    }
    resp = requests.get(f"{API_URL}/v2/diary", params=params, headers=headers)
    
    if resp.status_code == 401:
        return {"error": "session_expired"}
    if not resp.ok:
        return {"error": f"API error (status {resp.status_code})"}

    data = resp.json()
    items = data.get("items", [])

    # Group by meal
    meals = {"Breakfast": [], "Lunch": [], "Dinner": [], "Snacks": []}
    meal_names = {0: "Breakfast", 1: "Lunch", 2: "Dinner", 3: "Snacks"}

    for item in items:
        meal_pos = item.get("meal_position", 3)
        meal_name = meal_names.get(meal_pos, "Snacks")
        nc = item.get("nutritional_contents", {})
        energy = nc.get("energy", {})
        calories = energy.get("value", 0) if isinstance(energy, dict) else 0
        
        food = item.get("food", {})
        entry = {
            "name": food.get("description", "Unknown"),
            "brand": food.get("brand_name", ""),
            "calories": round(calories),
            "carbohydrates": round(nc.get("carbohydrates", 0)),
            "fat": round(nc.get("fat", 0)),
            "protein": round(nc.get("protein", 0)),
            "sodium": round(nc.get("sodium", 0)),
            "sugar": round(nc.get("sugar", 0)),
            "servings": item.get("servings", 1),
        }
        meals[meal_name].append(entry)

    # Build response
    result_meals = []
    total_cal = total_carb = total_fat = total_prot = total_sod = total_sug = 0
    for name in ["Breakfast", "Lunch", "Dinner", "Snacks"]:
        entries = meals[name]
        m_cal = sum(e["calories"] for e in entries)
        m_carb = sum(e["carbohydrates"] for e in entries)
        m_fat = sum(e["fat"] for e in entries)
        m_prot = sum(e["protein"] for e in entries)
        m_sod = sum(e["sodium"] for e in entries)
        m_sug = sum(e["sugar"] for e in entries)
        total_cal += m_cal
        total_carb += m_carb
        total_fat += m_fat
        total_prot += m_prot
        total_sod += m_sod
        total_sug += m_sug
        result_meals.append({
            "name": name,
            "entries": entries,
            "totals": {
                "calories": m_cal, "carbohydrates": m_carb, "fat": m_fat,
                "protein": m_prot, "sodium": m_sod, "sugar": m_sug,
            },
        })

    from datetime import datetime
    try:
        formatted_date = datetime.strptime(date_str, "%Y-%m-%d").strftime("%B %d, %Y")
    except Exception:
        formatted_date = date_str

    return {
        "date": formatted_date,
        "meals": result_meals,
        "totals": {
            "calories": total_cal, "carbohydrates": total_carb, "fat": total_fat,
            "protein": total_prot, "sodium": total_sod, "sugar": total_sug,
        },
    }


class MFPHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length))
        path = self.path

        try:
            if path == "/login":
                email = body.get("email", "")
                password = body.get("password", "")
                if not email or not password:
                    self._send_json(400, {"error": "Email and password required"})
                    return
                result = login(email, password)
                self._send_json(200 if "access_token" in result else 401, result)

            elif path == "/refresh":
                tok = body.get("refresh_token", "")
                if not tok:
                    self._send_json(400, {"error": "Refresh token required"})
                    return
                result = refresh_token(tok)
                self._send_json(200 if "access_token" in result else 401, result)

            elif path == "/diary":
                access_tok = body.get("access_token", "")
                domain_user_id = body.get("domain_user_id", "")
                date_str = body.get("date", "")
                if not access_tok or not date_str:
                    self._send_json(400, {"error": "access_token and date required"})
                    return
                result = fetch_diary(access_tok, domain_user_id, date_str)
                if result.get("error") == "session_expired":
                    self._send_json(401, result)
                else:
                    self._send_json(200 if "error" not in result else 500, result)

            else:
                self._send_json(404, {"error": "Not found"})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        print(f"[MFP] {args[0]}")


if __name__ == "__main__":
    port = 8787
    print(f"MFP API server on port {port}")
    server = HTTPServer(("0.0.0.0", port), MFPHandler)
    server.serve_forever()
