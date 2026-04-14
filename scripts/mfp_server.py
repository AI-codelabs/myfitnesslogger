#!/usr/bin/env python3
"""Simple HTTP server that uses python-myfitnesspal to fetch food diary data."""

import json
import sys
import http.cookiejar
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import date, datetime

try:
    import myfitnesspal
except ImportError:
    print("myfitnesspal not installed. Run: pip install myfitnesspal")
    sys.exit(1)


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
    # Build a cookiejar from the raw cookie string
    jar = http.cookiejar.CookieJar()
    
    for cookie_pair in cookie_string.split(";"):
        cookie_pair = cookie_pair.strip()
        if "=" not in cookie_pair:
            continue
        name, value = cookie_pair.split("=", 1)
        cookie = http.cookiejar.Cookie(
            version=0,
            name=name.strip(),
            value=value.strip(),
            port=None, port_specified=False,
            domain=".myfitnesspal.com",
            domain_specified=True, domain_initial_dot=True,
            path="/", path_specified=True,
            secure=True,
            expires=None,
            discard=True,
            comment=None,
            comment_url=None,
            rest={"HttpOnly": None},
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
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            cookies = data.get("cookies", "")
            target_date = data.get("date")
            
            if not cookies:
                self.send_response(400)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No cookies provided"}).encode())
                return

            result = fetch_food_log(cookies, target_date)
            
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args):
        print(f"[MFP Server] {args[0]}")


if __name__ == "__main__":
    port = 8787
    server = HTTPServer(("0.0.0.0", port), MFPHandler)
    print(f"MFP API server running on port {port}")
    server.serve_forever()
