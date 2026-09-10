import { controlJob } from "../../control-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return controlJob(request, (await params).id, "cancel");
}
