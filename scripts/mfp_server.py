#!/usr/bin/env python3
"""HTTP server that handles MFP login and food diary fetching."""

import json
import sys
import http.cookiejar
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import date

try:
    import cloudscraper
    import requests
    import myfitnesspal
except ImportError:
    print("Required packages not installed.")
    sys.exit(1)


BASE_URL = "https://www.myfitnesspal.com/"
CSRF_URL = BASE_URL + "api/auth/csrf"
LOGIN_URL = BASE_URL + "api/auth/callback/credentials"
AUTH_TOKEN_URL = BASE_URL + "user/auth_token?refresh=true"


def login_to_mfp(email: str, password: str) -> dict:
    """Login to MFP and return session cookies as a string."""
    session = cloudscraper.create_scraper(sess=requests.Session())
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })

    # Step 1: Get CSRF token
    csrf_resp = session.get(CSRF_URL)
    if not csrf_resp.ok:
        return {"error": f"Failed to get CSRF token (status {csrf_resp.status_code})"}
    
    csrf_data = csrf_resp.json()
    csrf_token = csrf_data.get("csrfToken")
    if not csrf_token:
        return {"error": "No CSRF token found in response"}

    # Step 2: Login with credentials
    login_resp = session.post(LOGIN_URL, data={
        "username": email,
        "password": password,
        "csrfToken": csrf_token,
        "callbackUrl": BASE_URL,
        "json": "true",
    }, allow_redirects=False)

    # Check for successful auth - MFP returns various status codes
    # Collect all cookies
    cookie_str = "; ".join(
        f"{c.name}={c.value}" for c in session.cookies
    )
    
    if not cookie_str:
        return {"error": "Login failed - no session cookies received. Check your credentials."}

    # Step 3: Verify we're actually logged in by hitting auth_token
    verify_resp = session.get(AUTH_TOKEN_URL)
    if not verify_resp.ok:
        return {"error": "Login appeared to succeed but session verification failed. MFP may have blocked the login (captcha)."}

    try:
        auth_data = verify_resp.json()
        username = auth_data.get("user_name", email)
    except Exception:
        username = email

    return {"cookies": cookie_str, "username": username}


def entry_to_dict(entry):
    nutrition = dict(entry.nutrition_information)
    return {
        "name": entry.short_name,
        "calories": nutrition.get("calories", 0),
        "carbohydrates": nutrition.get("carbohydrates", 0),
        "fat": nutrition.get("fat", 0),
        "protein": nutrition.get("protein", 0),
        "sodium": nutrition.get("sodium", 0),
        "sugar": nutrition.get("sugar", 0),
    }


def meal_to_dict(meal):
    entries = [entry_to_dict(e) for e in meal.entries]
    totals = dict(meal.totals)
    return {
        "name": meal.name,
        "entries": entries,
        "totals": {
            "calories": totals.get("calories", 0),
            "carbohydrates": totals.get("carbohydrates", 0),
            "fat": totals.get("fat", 0),
            "protein": totals.get("protein", 0),
            "sodium": totals.get("sodium", 0),
            "sugar": totals.get("sugar", 0),
        },
    }


def fetch_food_log(cookie_string: str, target_date: str | None = None):
    """Fetch food log from MFP using provided cookies."""
    jar = http.cookiejar.CookieJar()
    for cookie_pair in cookie_string.split(";"):
        cookie_pair = cookie_pair.strip()
        if "=" not in cookie_pair:
            continue
        name, value = cookie_pair.split("=", 1)
        cookie = http.cookiejar.Cookie(
            version=0, name=name.strip(), value=value.strip(),
            port=None, port_specified=False,
            domain=".myfitnesspal.com", domain_specified=True, domain_initial_dot=True,
            path="/", path_specified=True, secure=True,
            expires=None, discard=True,
            comment=None, comment_url=None, rest={"HttpOnly": None},
        )
        jar.set_cookie(cookie)

    client = myfitnesspal.Client(cookiejar=jar)

    if target_date:
        parts = target_date.split("-")
        d = date(int(parts[0]), int(parts[1]), int(parts[2]))
    else:
        d = date.today()

    day = client.get_date(d.year, d.month, d.day)
    meals = [meal_to_dict(m) for m in day.meals]
    day_totals = dict(day.totals)

    return {
        "date": d.strftime("%B %d, %Y"),
        "meals": meals,
        "totals": {
            "calories": day_totals.get("calories", 0),
            "carbohydrates": day_totals.get("carbohydrates", 0),
            "fat": day_totals.get("fat", 0),
            "protein": day_totals.get("protein", 0),
            "sodium": day_totals.get("sodium", 0),
            "sugar": day_totals.get("sugar", 0),
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
                    self._send_json(400, {"error": "Email and password are required"})
                    return
                result = login_to_mfp(email, password)
                status = 200 if "cookies" in result else 401
                self._send_json(status, result)

            elif path == "/fetch":
                cookies = body.get("cookies", "")
                target_date = body.get("date")
                if not cookies:
                    self._send_json(400, {"error": "No cookies provided"})
                    return
                result = fetch_food_log(cookies, target_date)
                self._send_json(200, result)

            else:
                self._send_json(404, {"error": "Not found"})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def log_message(self, format, *args):
        print(f"[MFP] {args[0]}")


if __name__ == "__main__":
    port = 8787
    server = HTTPServer(("0.0.0.0", port), MFPHandler)
    print(f"MFP API server on port {port}")
    server.serve_forever()
