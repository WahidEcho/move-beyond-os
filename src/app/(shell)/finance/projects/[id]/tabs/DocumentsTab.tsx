import { getDocuments } from "@/services/queries";
import { DocumentsPanel } from "@/components/shared/DocumentsPanel";

export async function DocumentsTab({ entityType, entityId }: { entityType: string; entityId: string }) {
  const docs = await getDocuments(entityType, entityId);
  return <DocumentsPanel entityType={entityType} entityId={entityId} docs={docs} />;
}
