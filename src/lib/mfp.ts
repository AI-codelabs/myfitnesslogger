export async function loginToMfp(email: string, password: string) {
  const res = await fetch("/api/mfp/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function fetchFoodLog(cookies: string, date?: string) {
  const res = await fetch("/api/mfp/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookies, date }),
  });
  return res.json();
}
