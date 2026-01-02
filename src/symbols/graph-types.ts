/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK GRAPH TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for graph relationships between symbols.
 * Based on research from:
 * - Microsoft GraphRAG relationship model
 * - Neo4j knowledge graph patterns
 * - FIBO (Financial Industry Business Ontology)
 * - FinDKG (Financial Dynamic Knowledge Graph)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP TYPE TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Primary relationship categories aligned with GraphRAG research.
 * Each category contains semantically related relationship types.
 */
export type RelationshipCategory =
  | 'CAUSAL'       // Cause-effect relationships
  | 'TEMPORAL'     // Time-based relationships
  | 'HIERARCHICAL' // Parent-child, contains, part-of
  | 'ASSOCIATIVE'  // General association, related-to
  | 'COMPETITIVE'  // Market competition relationships
  | 'DEPENDENCY'   // Depends-on, requires
  | 'OWNERSHIP'    // Controls, owns, subsidiary
  | 'REGULATORY';  // Compliance, regulated-by

/**
 * Specific relationship types for financial/business domains.
 * Based on FIBO and FinDKG ontologies.
 */
export type RelationshipType =
  // Causal relationships
  | 'CAUSES'
  | 'TRIGGERS'
  | 'LEADS_TO'
  | 'RESULTS_IN'
  | 'ENABLES'
  | 'PREVENTS'

  // Temporal relationships
  | 'PRECEDES'
  | 'FOLLOWS'
  | 'CONCURRENT_WITH'
  | 'SUPERSEDES'
  | 'SUPERSEDED_BY'

  // Hierarchical relationships
  | 'PARENT_OF'
  | 'CHILD_OF'
  | 'CONTAINS'
  | 'PART_OF'
  | 'ELABORATES'
  | 'SUMMARIZES'

  // Associative relationships
  | 'RELATED_TO'
  | 'REFERENCES'
  | 'SIMILAR_TO'
  | 'CONTRASTS_WITH'
  | 'COMPLEMENTS'

  // Competitive relationships
  | 'COMPETES_WITH'
  | 'OUTPERFORMS'
  | 'UNDERPERFORMS'
  | 'DISRUPTS'
  | 'CHALLENGES'

  // Dependency relationships
  | 'DEPENDS_ON'
  | 'REQUIRES'
  | 'SUPPORTS'
  | 'BLOCKS'
  | 'EXPOSED_TO'

  // Ownership relationships
  | 'OWNS'
  | 'CONTROLS'
  | 'SUBSIDIARY_OF'
  | 'ACQUIRED_BY'
  | 'MERGED_WITH'
  | 'PARTNERS_WITH'

  // Regulatory relationships
  | 'REGULATED_BY'
  | 'COMPLIANT_WITH'
  | 'SUBJECT_TO'
  | 'FILED_WITH'
  | 'AUDITED_BY';

/**
 * Maps relationship types to their categories for filtering.
 */
export const RELATIONSHIP_CATEGORIES: Record<RelationshipType, RelationshipCategory> = {
  // Causal
  CAUSES: 'CAUSAL',
  TRIGGERS: 'CAUSAL',
  LEADS_TO: 'CAUSAL',
  RESULTS_IN: 'CAUSAL',
  ENABLES: 'CAUSAL',
  PREVENTS: 'CAUSAL',

  // Temporal
  PRECEDES: 'TEMPORAL',
  FOLLOWS: 'TEMPORAL',
  CONCURRENT_WITH: 'TEMPORAL',
  SUPERSEDES: 'TEMPORAL',
  SUPERSEDED_BY: 'TEMPORAL',

  // Hierarchical
  PARENT_OF: 'HIERARCHICAL',
  CHILD_OF: 'HIERARCHICAL',
  CONTAINS: 'HIERARCHICAL',
  PART_OF: 'HIERARCHICAL',
  ELABORATES: 'HIERARCHICAL',
  SUMMARIZES: 'HIERARCHICAL',

  // Associative
  RELATED_TO: 'ASSOCIATIVE',
  REFERENCES: 'ASSOCIATIVE',
  SIMILAR_TO: 'ASSOCIATIVE',
  CONTRASTS_WITH: 'ASSOCIATIVE',
  COMPLEMENTS: 'ASSOCIATIVE',

  // Competitive
  COMPETES_WITH: 'COMPETITIVE',
  OUTPERFORMS: 'COMPETITIVE',
  UNDERPERFORMS: 'COMPETITIVE',
  DISRUPTS: 'COMPETITIVE',
  CHALLENGES: 'COMPETITIVE',

  // Dependency
  DEPENDS_ON: 'DEPENDENCY',
  REQUIRES: 'DEPENDENCY',
  SUPPORTS: 'DEPENDENCY',
  BLOCKS: 'DEPENDENCY',
  EXPOSED_TO: 'DEPENDENCY',

  // Ownership
  OWNS: 'OWNERSHIP',
  CONTROLS: 'OWNERSHIP',
  SUBSIDIARY_OF: 'OWNERSHIP',
  ACQUIRED_BY: 'OWNERSHIP',
  MERGED_WITH: 'OWNERSHIP',
  PARTNERS_WITH: 'OWNERSHIP',

  // Regulatory
  REGULATED_BY: 'REGULATORY',
  COMPLIANT_WITH: 'REGULATORY',
  SUBJECT_TO: 'REGULATORY',
  FILED_WITH: 'REGULATORY',
  AUDITED_BY: 'REGULATORY',
};

/**
 * Inverse relationship mappings for bidirectional traversal.
 */
export const INVERSE_RELATIONSHIPS: Partial<Record<RelationshipType, RelationshipType>> = {
  CAUSES: 'RESULTS_IN',
  RESULTS_IN: 'CAUSES',
  TRIGGERS: 'RESULTS_IN',
  PRECEDES: 'FOLLOWS',
  FOLLOWS: 'PRECEDES',
  SUPERSEDES: 'SUPERSEDED_BY',
  SUPERSEDED_BY: 'SUPERSEDES',
  PARENT_OF: 'CHILD_OF',
  CHILD_OF: 'PARENT_OF',
  CONTAINS: 'PART_OF',
  PART_OF: 'CONTAINS',
  ELABORATES: 'SUMMARIZES',
  SUMMARIZES: 'ELABORATES',
  OWNS: 'SUBSIDIARY_OF',
  SUBSIDIARY_OF: 'OWNS',
  CONTROLS: 'SUBSIDIARY_OF',
  ACQUIRED_BY: 'OWNS',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL RELATIONSHIP INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Represents a directed relationship between two symbols.
 */
export interface SymbolRelationship {
  /** Unique relationship ID */
  id: number;

  /** Source symbol ID (from) */
  fromSymbolId: string;

  /** Target symbol ID (to) */
  toSymbolId: string;

  /** Type of relationship */
  relationshipType: RelationshipType;

  /** Relationship category (derived from type) */
  category: RelationshipCategory;

  /**
   * Relationship weight/strength (0.0-1.0)
   * Based on:
   * - Source authority (SEC > press release > news)
   * - Extraction confidence
   * - Corroboration (multiple sources)
   * - Recency
   */
  weight: number;

  /**
   * Confidence score for extracted relationships (0.0-1.0)
   */
  confidence: number;

  /** Additional properties as JSON */
  properties?: RelationshipProperties;

  /** Evidence/source for this relationship */
  evidence?: string;

  /** When the relationship was created */
  createdAt: string;

  /** Who created the relationship */
  createdBy?: string;
}

/**
 * Optional properties that can be attached to relationships.
 */
export interface RelationshipProperties {
  /** Source document/URL for this relationship */
  source?: string;

  /** Specific text that evidences the relationship */
  evidenceText?: string;

  /** Time period this relationship is valid for */
  validFrom?: string;
  validUntil?: string;

  /** Quantitative attributes */
  percentage?: number;  // For ownership, market share
  amount?: number;      // For financial amounts
  currency?: string;    // Currency code

  /** Custom attributes */
  [key: string]: unknown;
}

/**
 * Request to create a new relationship.
 */
export interface CreateRelationshipRequest {
  fromSymbolId: string;
  toSymbolId: string;
  relationshipType: RelationshipType;
  weight?: number;
  confidence?: number;
  properties?: RelationshipProperties;
  evidence?: string;
  createdBy?: string;

  /** If true, also create the inverse relationship */
  bidirectional?: boolean;
}

/**
 * Options for querying relationships.
 */
export interface RelationshipQueryOptions {
  /** Filter by relationship types */
  types?: RelationshipType[];

  /** Filter by relationship categories */
  categories?: RelationshipCategory[];

  /** Minimum weight threshold */
  minWeight?: number;

  /** Minimum confidence threshold */
  minConfidence?: number;

  /** Include inverse relationships in results */
  includeBidirectional?: boolean;

  /** Maximum number of results */
  limit?: number;

  /** Order by field */
  orderBy?: 'weight' | 'confidence' | 'createdAt';
  orderDirection?: 'ASC' | 'DESC';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH TRAVERSAL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for graph traversal operations.
 */
export interface TraversalOptions {
  /** Maximum traversal depth (hops) */
  maxDepth?: number;

  /** Filter by relationship types */
  relationshipTypes?: RelationshipType[];

  /** Filter by relationship categories */
  categories?: RelationshipCategory[];

  /** Minimum weight for traversal */
  minWeight?: number;

  /** Whether to traverse in both directions */
  bidirectional?: boolean;

  /** Maximum nodes to return */
  limit?: number;

  /** Include path information */
  includePaths?: boolean;
}

/**
 * A node in the traversal result with distance information.
 */
export interface TraversalNode {
  /** Symbol ID */
  symbolId: string;

  /** Distance from starting node (hops) */
  depth: number;

  /** Path from start to this node */
  path?: string[];

  /** Relationships used to reach this node */
  pathRelationships?: RelationshipType[];

  /** Cumulative weight along the path */
  pathWeight?: number;

  /** The relationship that led to this node (from parent) */
  viaRelationship?: RelationshipType;

  /** Parent node in the traversal */
  viaNode?: string;
}

/**
 * Result of a neighborhood traversal.
 */
export interface NeighborhoodResult {
  /** Starting symbol ID */
  startSymbol: string;

  /** All reachable nodes within maxDepth */
  nodes: TraversalNode[];

  /** Total edges traversed */
  edgesTraversed: number;

  /** Traversal statistics */
  stats: {
    nodesAtDepth: Record<number, number>;
    byRelationshipType: Record<RelationshipType, number>;
  };
}

/**
 * Result of a path-finding operation.
 */
export interface PathResult {
  /** Source symbol ID */
  from: string;

  /** Target symbol ID */
  to: string;

  /** Whether a path was found */
  found: boolean;

  /** All paths found (if any) */
  paths: PathInfo[];
}

/**
 * Information about a single path.
 */
export interface PathInfo {
  /** Ordered list of symbol IDs in the path */
  nodes: string[];

  /** Relationship types between nodes */
  relationships: RelationshipType[];

  /** Path length (number of hops) */
  length: number;

  /** Cumulative weight of the path */
  totalWeight: number;

  /** Minimum confidence along the path */
  minConfidence: number;
}

/**
 * Result of finding related symbols.
 */
export interface RelatedSymbolsResult {
  /** The symbol we searched from */
  symbolId: string;

  /** Directly related symbols */
  related: Array<{
    symbolId: string;
    relationship: RelationshipType;
    direction: 'outgoing' | 'incoming';
    weight: number;
    confidence: number;
  }>;

  /** Count by relationship type */
  countByType: Record<RelationshipType, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Centrality metrics for a symbol in the graph.
 */
export interface SymbolCentrality {
  symbolId: string;

  /** Degree centrality (number of connections) */
  degreeCentrality: number;

  /** In-degree (incoming relationships) */
  inDegree: number;

  /** Out-degree (outgoing relationships) */
  outDegree: number;

  /** Weighted degree (sum of weights) */
  weightedDegree: number;
}

/**
 * Graph-level statistics.
 */
export interface GraphStats {
  /** Total number of symbols (nodes) */
  nodeCount: number;

  /** Total number of relationships (edges) */
  edgeCount: number;

  /** Average degree per node */
  averageDegree: number;

  /** Distribution of relationship types */
  relationshipDistribution: Record<RelationshipType, number>;

  /** Distribution of relationship categories */
  categoryDistribution: Record<RelationshipCategory, number>;

  /** Top N symbols by centrality */
  topSymbolsByCentrality: SymbolCentrality[];

  /** Graph density (edges / possible edges) */
  density: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION TYPES (for document processing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A relationship extracted from a document.
 */
export interface ExtractedRelationship {
  /** Source entity/symbol */
  fromEntity: string;

  /** Target entity/symbol */
  toEntity: string;

  /** Detected relationship type */
  relationshipType: RelationshipType;

  /** Extraction confidence (0.0-1.0) */
  confidence: number;

  /** Text that evidences this relationship */
  evidenceText: string;

  /** Position in source document */
  sourcePosition?: {
    start: number;
    end: number;
    chunk?: number;
  };
}

/**
 * Result of relationship extraction from a document.
 */
export interface RelationshipExtractionResult {
  /** Extracted relationships */
  relationships: ExtractedRelationship[];

  /** Entities mentioned that might need symbols */
  mentionedEntities: string[];

  /** Processing metadata */
  metadata: {
    documentSource: string;
    processingTimeMs: number;
    modelUsed: string;
    totalChunks: number;
  };
}
