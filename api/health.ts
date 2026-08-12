export default function handler(req: any, res: any) {
  res.status(200).json({ ok: true, node: process.version, hasDb: !!process.env.DATABASE_URL });
}
