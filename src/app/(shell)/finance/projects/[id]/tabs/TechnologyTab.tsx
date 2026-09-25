import type { getProjectTechnology, Lookups } from "@/services/queries";
import { TechnologyPanel } from "./TechnologyPanel";

export function TechnologyTab({ projectId, tech, lookups, closed }: {
  projectId: string; tech: Awaited<ReturnType<typeof getProjectTechnology>>; lookups: Lookups; closed: boolean;
}) {
  return <TechnologyPanel projectId={projectId} tech={tech} lookups={lookups} closed={closed} />;
}
