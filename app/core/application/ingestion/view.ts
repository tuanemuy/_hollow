import type { IngestionJob } from "@/core/domain/ingestion/entity";
import { type IngestionJobDTO, toIngestionJobDTO } from "../dto/ingestion";

export type IngestionJobView = IngestionJobDTO;

export function toIngestionJobView(job: IngestionJob): IngestionJobView {
  return toIngestionJobDTO(job);
}
