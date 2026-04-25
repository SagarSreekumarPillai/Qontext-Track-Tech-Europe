export type SourceType = "crm" | "email" | "hr" | "ticket" | "policy" | "collab" | "it" | "business";
export type EntityType =
  | "customer"
  | "employee"
  | "project"
  | "task"
  | "policy"
  | "process";

export type RawRecord = {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  content: string;
  timestamp: string;
};

export type Fact = {
  id: string;
  key: string;
  value: string;
  confidence: number;
  sourceType: SourceType;
  sourceId: string;
  timestamp: string;
  externalVerified?: boolean;
  externalSourceUrl?: string;
};

export type EntityMemory = {
  entityType: EntityType;
  entityId: string;
  slug: string;
  filePath: string;
  summary: string;
  facts: Fact[];
  linkedEntityIds: string[];
  activeTasks: string[];
  openTickets: string[];
  policyRefs: string[];
};

export type Relationship = {
  id: string;
  from: string;
  relation: string;
  to: string;
  confidence: number;
};

export type ReviewItem = {
  id: string;
  entityId: string;
  factKey: string;
  oldValue: string;
  proposedValue: string;
  confidence: number;
  sourceType: SourceType;
  sourceId: string;
  reason: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
};

export type UpdateLog = {
  id: string;
  entityId: string;
  factKey: string;
  oldValue: string;
  newValue: string;
  action: "auto_applied" | "queued" | "approved" | "rejected";
  timestamp: string;
};

export type QontextState = {
  rawRecords: RawRecord[];
  entities: Record<string, EntityMemory>;
  relationships: Relationship[];
  reviewQueue: ReviewItem[];
  updateHistory: UpdateLog[];
};

export type ExtractedFact = {
  entityType: EntityType;
  entityId: string;
  fact: string;
  value: string;
  confidence: number;
  ambiguityReason?: string;
};

const now = () => new Date().toISOString();
const SEED_TS = "2026-04-25T09:00:00.000Z";

const mkFact = (
  id: string,
  key: string,
  value: string,
  confidence: number,
  sourceType: SourceType,
  sourceId: string,
  timestamp: string = SEED_TS
): Fact => ({
  id,
  key,
  value,
  confidence,
  sourceType,
  sourceId,
  timestamp,
});

const acme: EntityMemory = {
  entityType: "customer",
  entityId: "customer:acme",
  slug: "acme",
  filePath: "/customers/acme.md",
  summary:
    "Acme is a strategic onboarding customer with active implementation dependencies.",
  facts: [
    mkFact("f_owner", "account_owner", "Sarah", 0.95, "crm", "CRM-102"),
    mkFact("f_tier", "tier", "Enterprise", 0.98, "crm", "CRM-102"),
  ],
  linkedEntityIds: ["employee:sarah", "project:q4-migration", "policy:onboarding-sla"],
  activeTasks: ["Finalize onboarding checklist"],
  openTickets: ["TICKET-443: Onboarding API access issue"],
  policyRefs: ["POL-ONBOARD-48H"],
};

const sarah: EntityMemory = {
  entityType: "employee",
  entityId: "employee:sarah",
  slug: "sarah",
  filePath: "/employees/sarah.md",
  summary: "Sarah leads enterprise onboarding and owns strategic customer transitions.",
  facts: [mkFact("f_role", "role", "Account Executive", 0.99, "hr", "HR-2001")],
  linkedEntityIds: ["customer:acme"],
  activeTasks: ["Coordinate ownership transition"],
  openTickets: [],
  policyRefs: [],
};

const onboardingPolicy: EntityMemory = {
  entityType: "policy",
  entityId: "policy:onboarding-sla",
  slug: "onboarding",
  filePath: "/policies/onboarding.md",
  summary: "Enterprise onboarding tickets must receive a response within 48 hours.",
  facts: [
    mkFact("f_sla", "onboarding_sla_hours", "48", 0.97, "policy", "POL-ONBOARD-48H"),
  ],
  linkedEntityIds: ["customer:acme", "process:onboarding"],
  activeTasks: [],
  openTickets: [],
  policyRefs: [],
};

const project: EntityMemory = {
  entityType: "project",
  entityId: "project:q4-migration",
  slug: "q4-migration",
  filePath: "/projects/q4-migration.md",
  summary: "Q4 migration project tracks onboarding integrations and support dependencies.",
  facts: [mkFact("f_status", "status", "In Progress", 0.96, "ticket", "TICKET-443")],
  linkedEntityIds: ["customer:acme"],
  activeTasks: ["Resolve onboarding API access issue"],
  openTickets: ["TICKET-443"],
  policyRefs: ["POL-ONBOARD-48H"],
};

export const INITIAL_STATE: QontextState = {
  rawRecords: [
    {
      id: "r1",
      sourceType: "crm",
      sourceId: "CRM-102",
      content: "Sarah owns Acme account.",
      timestamp: SEED_TS,
    },
    {
      id: "r2",
      sourceType: "ticket",
      sourceId: "TICKET-443",
      content: "Acme has onboarding API access issue.",
      timestamp: "2026-04-25T09:00:30.000Z",
    },
    {
      id: "r3",
      sourceType: "policy",
      sourceId: "POL-ONBOARD-48H",
      content: "Onboarding SLA is 48 hours.",
      timestamp: "2026-04-25T09:01:00.000Z",
    },
  ],
  entities: {
    [acme.entityId]: acme,
    [sarah.entityId]: sarah,
    [onboardingPolicy.entityId]: onboardingPolicy,
    [project.entityId]: project,
  },
  relationships: [
    {
      id: "rel1",
      from: "employee:sarah",
      relation: "owns",
      to: "customer:acme",
      confidence: 0.95,
    },
    {
      id: "rel2",
      from: "customer:acme",
      relation: "linked_to",
      to: "project:q4-migration",
      confidence: 0.91,
    },
    {
      id: "rel3",
      from: "customer:acme",
      relation: "governed_by",
      to: "policy:onboarding-sla",
      confidence: 0.97,
    },
  ],
  reviewQueue: [],
  updateHistory: [],
};

export const DEMO_UPDATES: RawRecord[] = [
  {
    id: "u1",
    sourceType: "crm",
    sourceId: "CRM-109",
    content: "David owns Acme account.",
    timestamp: "2026-04-25T09:02:00.000Z",
  },
  {
    id: "u2",
    sourceType: "email",
    sourceId: "EMAIL-778",
    content: "Maybe Sarah still owns Acme during transition.",
    timestamp: "2026-04-25T09:03:00.000Z",
  },
];

export const fileGroups: Record<string, string[]> = {
  "/customers": ["/customers/acme.md"],
  "/employees": ["/employees/sarah.md"],
  "/projects": ["/projects/q4-migration.md"],
  "/tasks": [],
  "/policies": ["/policies/onboarding.md"],
  "/processes": [],
};

const folderByEntityType: Record<EntityType, string> = {
  customer: "/customers",
  employee: "/employees",
  project: "/projects",
  task: "/tasks",
  policy: "/policies",
  process: "/processes",
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toEntityType(input: string): EntityType {
  const normalized = input.toLowerCase();
  if (normalized === "customer") return "customer";
  if (normalized === "employee") return "employee";
  if (normalized === "project") return "project";
  if (normalized === "task") return "task";
  if (normalized === "policy") return "policy";
  return "process";
}

function ensureEntity(next: QontextState, entityType: EntityType, entitySlug: string): string {
  const entityId = `${entityType}:${entitySlug}`;
  if (next.entities[entityId]) return entityId;
  const folder = folderByEntityType[entityType];
  next.entities[entityId] = {
    entityType,
    entityId,
    slug: entitySlug,
    filePath: `${folder}/${entitySlug}.md`,
    summary: `${entitySlug} extracted from incoming enterprise records.`,
    facts: [],
    linkedEntityIds: [],
    activeTasks: [],
    openTickets: [],
    policyRefs: [],
  };
  return entityId;
}

function upsertRelationship(
  next: QontextState,
  from: string,
  relation: string,
  to: string,
  confidence: number
) {
  const existing = next.relationships.find(
    (rel) => rel.from === from && rel.to === to && rel.relation === relation
  );
  if (existing) {
    existing.confidence = Math.max(existing.confidence, confidence);
    return;
  }
  next.relationships.push({
    id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    relation,
    to,
    confidence,
  });
}

function parseOwner(content: string): { owner: string; confidence: number } | null {
  const lc = content.toLowerCase();
  if (lc.includes("david owns acme")) return { owner: "David", confidence: 0.96 };
  if (lc.includes("sarah owns acme")) return { owner: "Sarah", confidence: 0.95 };
  if (lc.includes("maybe sarah still owns acme")) {
    return { owner: "Sarah", confidence: 0.62 };
  }
  return null;
}

function updateEdge(
  edges: Relationship[],
  from: string,
  relation: string,
  to: string,
  confidence: number
) {
  const idx = edges.findIndex(
    (edge) => edge.relation === relation && edge.to === to && edge.from.startsWith("employee:")
  );
  if (idx >= 0) {
    edges[idx] = { ...edges[idx], from, confidence };
    return;
  }
  edges.push({
    id: `rel-${Date.now()}`,
    from,
    relation,
    to,
    confidence,
  });
}

export function applyIncomingRecord(
  state: QontextState,
  record: RawRecord,
  override?: { owner: string; confidence: number }
): QontextState {
  const next: QontextState = {
    ...state,
    rawRecords: [record, ...state.rawRecords],
    entities: { ...state.entities },
    relationships: [...state.relationships],
    reviewQueue: [...state.reviewQueue],
    updateHistory: [...state.updateHistory],
  };

  const ownerUpdate = override ?? parseOwner(record.content);
  if (!ownerUpdate) return next;

  const customer = next.entities["customer:acme"];
  if (!customer) return next;

  const ownerFact = customer.facts.find((fact) => fact.key === "account_owner");
  if (!ownerFact) return next;

  if (ownerUpdate.confidence > 0.9) {
    const oldValue = ownerFact.value;
    ownerFact.value = ownerUpdate.owner;
    ownerFact.confidence = ownerUpdate.confidence;
    ownerFact.sourceType = record.sourceType;
    ownerFact.sourceId = record.sourceId;
    ownerFact.timestamp = record.timestamp;

    const ownerEntityId =
      ownerUpdate.owner.toLowerCase() === "david" ? "employee:david" : "employee:sarah";
    if (!next.entities[ownerEntityId]) {
      next.entities[ownerEntityId] = {
        entityType: "employee",
        entityId: "employee:david",
        slug: "david",
        filePath: "/employees/david.md",
        summary: "David is managing Acme ownership post-transition.",
        facts: [mkFact("f_david_role", "role", "Account Manager", 0.93, "crm", "CRM-109")],
        linkedEntityIds: ["customer:acme"],
        activeTasks: ["Lead Acme transition"],
        openTickets: [],
        policyRefs: [],
      };
    }

    updateEdge(next.relationships, ownerEntityId, "owns", "customer:acme", ownerUpdate.confidence);

    next.updateHistory.unshift({
      id: `h-${Date.now()}`,
      entityId: "customer:acme",
      factKey: "account_owner",
      oldValue,
      newValue: ownerUpdate.owner,
      action: "auto_applied",
      timestamp: record.timestamp,
    });

    return next;
  }

  next.reviewQueue.unshift({
    id: `rv-${Date.now()}`,
    entityId: "customer:acme",
    factKey: "account_owner",
    oldValue: ownerFact.value,
    proposedValue: ownerUpdate.owner,
    confidence: ownerUpdate.confidence,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    reason: "Ambiguous ownership transition detected.",
    timestamp: record.timestamp,
    status: "pending",
  });

  next.updateHistory.unshift({
    id: `h-${Date.now() + 1}`,
    entityId: "customer:acme",
    factKey: "account_owner",
    oldValue: ownerFact.value,
    newValue: ownerUpdate.owner,
    action: "queued",
    timestamp: record.timestamp,
  });

  return next;
}

export function applyExtractedFacts(
  state: QontextState,
  record: RawRecord,
  extractedFacts: ExtractedFact[]
): QontextState {
  const next: QontextState = {
    ...state,
    rawRecords: [record, ...state.rawRecords],
    entities: { ...state.entities },
    relationships: [...state.relationships],
    reviewQueue: [...state.reviewQueue],
    updateHistory: [...state.updateHistory],
  };

  for (const item of extractedFacts) {
    const entityType = toEntityType(item.entityType);
    const entitySlug = slugify(item.entityId || "unknown");
    const entityId = ensureEntity(next, entityType, entitySlug);
    const entity = next.entities[entityId];
    const factKey = slugify(item.fact || "fact");
    const normalizedValue = String(item.value ?? "").trim();
    if (!normalizedValue) continue;

    const existingFact = entity.facts.find((fact) => fact.key === factKey);
    const shouldQueue = item.confidence <= 0.9 || Boolean(item.ambiguityReason);

    if (!existingFact) {
      if (shouldQueue) {
        next.reviewQueue.unshift({
          id: `rv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue: "None",
          proposedValue: normalizedValue,
          confidence: item.confidence,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          reason: item.ambiguityReason ?? "Low-confidence new fact requires human review.",
          timestamp: record.timestamp,
          status: "pending",
        });
        next.updateHistory.unshift({
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue: "None",
          newValue: normalizedValue,
          action: "queued",
          timestamp: record.timestamp,
        });
      } else {
        entity.facts.push(
          mkFact(
            `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            factKey,
            normalizedValue,
            item.confidence,
            record.sourceType,
            record.sourceId,
            record.timestamp
          )
        );
        next.updateHistory.unshift({
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue: "None",
          newValue: normalizedValue,
          action: "auto_applied",
          timestamp: record.timestamp,
        });
      }
    } else {
      if (existingFact.value === normalizedValue) {
        existingFact.confidence = Math.max(existingFact.confidence, item.confidence);
        existingFact.sourceType = record.sourceType;
        existingFact.sourceId = record.sourceId;
        existingFact.timestamp = record.timestamp;
      } else if (shouldQueue) {
        next.reviewQueue.unshift({
          id: `rv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue: existingFact.value,
          proposedValue: normalizedValue,
          confidence: item.confidence,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          reason: item.ambiguityReason ?? "Conflicting fact with low confidence.",
          timestamp: record.timestamp,
          status: "pending",
        });
        next.updateHistory.unshift({
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue: existingFact.value,
          newValue: normalizedValue,
          action: "queued",
          timestamp: record.timestamp,
        });
      } else {
        const oldValue = existingFact.value;
        existingFact.value = normalizedValue;
        existingFact.confidence = item.confidence;
        existingFact.sourceType = record.sourceType;
        existingFact.sourceId = record.sourceId;
        existingFact.timestamp = record.timestamp;
        next.updateHistory.unshift({
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entityId,
          factKey,
          oldValue,
          newValue: normalizedValue,
          action: "auto_applied",
          timestamp: record.timestamp,
        });
      }
    }

    if (factKey.includes("owner") || factKey.includes("owns")) {
      const ownerSlug = slugify(normalizedValue);
      const ownerEntityId = ensureEntity(next, "employee", ownerSlug);
      upsertRelationship(next, ownerEntityId, "owns", entityId, item.confidence);
      if (!entity.linkedEntityIds.includes(ownerEntityId)) entity.linkedEntityIds.push(ownerEntityId);
      const ownerEntity = next.entities[ownerEntityId];
      if (!ownerEntity.linkedEntityIds.includes(entityId)) ownerEntity.linkedEntityIds.push(entityId);
    }
  }

  return next;
}

export function deriveFileGroups(state: QontextState): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    "/customers": [],
    "/employees": [],
    "/projects": [],
    "/tasks": [],
    "/policies": [],
    "/processes": [],
  };

  for (const entity of Object.values(state.entities)) {
    const folder = folderByEntityType[entity.entityType];
    groups[folder].push(entity.filePath);
  }

  for (const key of Object.keys(groups)) {
    groups[key] = groups[key].sort((a, b) => a.localeCompare(b));
  }
  return groups;
}

export function applyReviewDecision(
  state: QontextState,
  reviewId: string,
  decision: "approved" | "rejected"
): QontextState {
  const item = state.reviewQueue.find((entry) => entry.id === reviewId);
  if (!item || item.status !== "pending") return state;

  const next: QontextState = {
    ...state,
    entities: { ...state.entities },
    reviewQueue: state.reviewQueue.map((entry) =>
      entry.id === reviewId ? { ...entry, status: decision } : entry
    ),
    updateHistory: [...state.updateHistory],
    relationships: [...state.relationships],
    rawRecords: [...state.rawRecords],
  };

  if (decision === "approved") {
    const customer = next.entities[item.entityId];
    const ownerFact = customer?.facts.find((fact) => fact.key === item.factKey);
    if (ownerFact) {
      const oldValue = ownerFact.value;
      ownerFact.value = item.proposedValue;
      ownerFact.confidence = item.confidence;
      ownerFact.sourceType = item.sourceType;
      ownerFact.sourceId = item.sourceId;
      ownerFact.timestamp = now();
      next.updateHistory.unshift({
        id: `h-${Date.now()}`,
        entityId: item.entityId,
        factKey: item.factKey,
        oldValue,
        newValue: item.proposedValue,
        action: "approved",
        timestamp: now(),
      });
    }
  } else {
    next.updateHistory.unshift({
      id: `h-${Date.now()}`,
      entityId: item.entityId,
      factKey: item.factKey,
      oldValue: item.oldValue,
      newValue: item.proposedValue,
      action: "rejected",
      timestamp: now(),
    });
  }

  return next;
}

export function markFactVerification(
  state: QontextState,
  entityId: string,
  factKey: string,
  verification: { verified: boolean; sourceUrl?: string }
): QontextState {
  if (!verification.verified) return state;
  const entity = state.entities[entityId];
  if (!entity) return state;

  const facts = entity.facts.map((fact) =>
    fact.key === factKey
      ? {
          ...fact,
          externalVerified: true,
          externalSourceUrl: verification.sourceUrl,
        }
      : fact
  );

  return {
    ...state,
    entities: {
      ...state.entities,
      [entityId]: {
        ...entity,
        facts,
      },
    },
  };
}
