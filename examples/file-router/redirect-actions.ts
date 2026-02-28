"use server";

import { redirect } from "@lazarv/react-server";

export async function redirectNavigate() {
  redirect("/about", 302, "navigate");
}

export async function redirectPush() {
  redirect("/about", 302, "push");
}

export async function redirectLocation() {
  redirect("/about", 302, "location");
}

export async function redirectLocationExternal() {
  redirect("https://react-server.dev", 302, "location");
}

export async function redirectError() {
  redirect("/about", 302, "error");
}
