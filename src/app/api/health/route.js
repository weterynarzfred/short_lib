import db from "@/lib/db";

export async function GET() {
  const db_response = db.prepare("SELECT 1 as ok").get();

  const response = {
    db: db_response?.ok === 1,
  };
  return Response.json(response);
}
