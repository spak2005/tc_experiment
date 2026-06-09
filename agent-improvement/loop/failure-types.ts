export const improvementFailureTypes = [
  "instrumentation",
  "ingestion_extraction",
  "matching_routing",
  "decision_policy",
  "execution_write",
  "product_behavior",
  "no_gap"
] as const;

export type ImprovementFailureType = (typeof improvementFailureTypes)[number];

export function isImprovementFailureType(
  value: string
): value is ImprovementFailureType {
  return improvementFailureTypes.includes(value as ImprovementFailureType);
}
