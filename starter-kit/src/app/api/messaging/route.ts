import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ threadId: thread.id, messages: thread.messages });
  } catch (err) {
    console.error("Messaging GET Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, content, sender, patientId = "demo-patient", clinicId = "demo-clinic" } = body ?? {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    if (!["patient", "dentist"].includes(sender)) {
      return NextResponse.json({ error: "sender must be patient or dentist" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let thread = null;

      if (threadId) {
        thread = await tx.thread.findUnique({ where: { id: threadId } });
      }

      if (!thread) {
        thread = await tx.thread.create({
          data: {
            patientId,
            clinicId,
          },
        });
      }

      const message = await tx.message.create({
        data: {
          threadId: thread.id,
          content: content.trim(),
          sender,
        },
      });

      await tx.thread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      // Simulate clinic auto-reply for demo purposes
      if (sender === "patient") {
        const clinicReply = await tx.message.create({
          data: {
            threadId: thread.id,
            content: "Thank you for your message. A dental professional will review your scan and respond within 24 hours.",
            sender: "dentist",
          },
        });
        return { thread, message, clinicReply };
      }

      return { thread, message };
    });

    return NextResponse.json({ ok: true, threadId: result.thread.id, message: result.message, clinicReply: result.clinicReply });
  } catch (err) {
    console.error("Messaging API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
