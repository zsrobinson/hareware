export function requestCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";

  for (const cookie of cookies.split(";")) {
    const candidate = cookie.trim();
    if (candidate.startsWith(`${name}=`))
      return candidate.slice(name.length + 1);
  }

  return null;
}
