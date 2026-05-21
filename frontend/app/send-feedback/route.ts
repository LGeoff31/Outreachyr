import { NextResponse } from "next/server";

const FEEDBACK_TO = "geoffrey31415@gmail.com";
const FEEDBACK_SUBJECT = "Outreachyr feedback";

async function sendViaResend(message: string, replyTo: string | null) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  const from =
    process.env.RESEND_FROM?.trim() || "Outreachyr <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [FEEDBACK_TO],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: FEEDBACK_SUBJECT,
      text: message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Could not send feedback.");
  }

  return true;
}

async function sendViaFormSubmit(message: string) {
  const res = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(FEEDBACK_TO)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: FEEDBACK_SUBJECT,
        _captcha: "false",
        message,
      }),
    }
  );

  if (!res.ok) {
    throw new Error("Could not send feedback.");
  }

  const data = (await res.json()) as { success?: string };
  if (data.success !== "true") {
    throw new Error("Could not send feedback.");
  }

  return true;
}

export async function POST(request: Request) {
  let message: string;
  let fromEmail: string | null = null;
  try {
    const body = (await request.json()) as {
      message?: string;
      fromEmail?: string;
    };
    message = body.message?.trim() ?? "";
    fromEmail = body.fromEmail?.trim() || null;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  try {
    const sentWithResend = await sendViaResend(message, fromEmail);
    if (!sentWithResend) {
      await sendViaFormSubmit(message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Could not send feedback.";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
