import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, status, userId = "demo-patient", images = [] } = body ?? {};

    if (!scanId || typeof scanId !== "string") {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    if (status !== "completed") {
      return NextResponse.json({ ok: true, skipped: true, message: "No notification needed" });
    }

    const imageList = Array.isArray(images) ? images.filter(Boolean).join(",") : "";

    const scan = await prisma.scan.upsert({
      where: { id: scanId },
      update: {
        status: "completed",
        images: imageList,
      },
      create: {
        id: scanId,
        status: "completed",
        images: imageList,
      },
    });

    const notificationPromise = prisma.notification.create({
      data: {
        userId,
        scanId: scan.id,
        title: "Scan completed",
        message: "A new dental scan is ready for clinic review.",
        read: false,
      },
    });

    notificationPromise.catch((error) => {
      console.error("Notification dispatch failed", error);
    });

    return NextResponse.json({
      ok: true,
      scan,
      message: "Scan recorded and notification queued",
    });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
