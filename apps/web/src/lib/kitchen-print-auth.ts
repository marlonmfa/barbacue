import { printAgentConfigured, validPrintAgentAuthorization } from "@/lib/kitchen-print";

export function authorizePrintAgent(request: Request): Response | null {
  if (!printAgentConfigured(process.env.PRINT_AGENT_TOKEN)) {
    return Response.json({ error: "printing_not_configured", message: "Agente de impressão não configurado." }, { status: 503 });
  }
  if (!validPrintAgentAuthorization(request.headers.get("authorization"), process.env.PRINT_AGENT_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
