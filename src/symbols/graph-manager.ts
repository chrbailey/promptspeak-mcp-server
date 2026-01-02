/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK GRAPH MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Graph traversal and relationship management for PromptSpeak symbols.
 * Implements patterns from:
 * - Microsoft GraphRAG subgraph retrieval
 * - Neo4j Cypher traversal patterns
 * - SQLite recursive CTEs for path finding
 *
 * Key Features:
 * - N-hop neighborhood retrieval
 * - Shortest path finding
 * - Relationship type filtering
 * - Weighted traversal
 * - Bidirectional queries
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Statement } from 'better-sqlite3';
import { getDatabase } from './database.js';
import {
  type RelationshipType,
  type RelationshipCategory,
  type SymbolRelationship,
  type CreateRelationshipRequest,
  type RelationshipQueryOptions,
  type TraversalOptions,
  type TraversalNode,
  type NeighborhoodResult,
  type PathResult,
  type PathInfo,
  type RelatedSymbolsResult,
  type SymbolCentrality,
  type GraphStats,
  RELATIONSHIP_CATEGORIES,
  INVERSE_RELATIONSHIPS,
} from './graph-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE ROW TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RelationshipRow {
  id: number;
  from_symbol_id: string;
  to_symbol_id: string;
  relationship_type: string;
  category: string;
  weight: number;
  confidence: number;
  properties: string | null;
  evidence: string | null;
  created_at: string;
  created_by: string | null;
}

interface TraversalRow {
  node_id: string;
  depth: number;
  path: string;
  path_relationships: string;
  path_weight: number;
  via_relationship: string | null;
  via_node: string | null;
}

interface CentralityRow {
  symbol_id: string;
  in_degree: number;
  out_degree: number;
  total_degree: number;
  weighted_degree: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class GraphManager {
  // Prepared statements (cached for performance)
  private stmtInsertRelationship!: Statement;
  private stmtGetRelationship!: Statement;
  private stmtDeleteRelationship!: Statement;
  private stmtGetOutgoing!: Statement;
  private stmtGetIncoming!: Statement;
  private stmtGetBidirectional!: Statement;
  private stmtCountByType!: Statement;
  private stmtCentrality!: Statement;

  private initialized = false;

  constructor() {
    // Lazy initialization to ensure database is ready
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    const db = getDatabase();

    // Insert relationship
    this.stmtInsertRelationship = db.prepare(`
      INSERT INTO symbol_relationships (
        from_symbol_id, to_symbol_id, relationship_type, category,
        weight, confidence, properties, evidence, created_at, created_by
      ) VALUES (
        @from_symbol_id, @to_symbol_id, @relationship_type, @category,
        @weight, @confidence, @properties, @evidence, @created_at, @created_by
      )
    `);

    // Get relationship by ID
    this.stmtGetRelationship = db.prepare(`
      SELECT * FROM symbol_relationships WHERE id = ?
    `);

    // Delete relationship
    this.stmtDeleteRelationship = db.prepare(`
      DELETE FROM symbol_relationships WHERE id = ?
    `);

    // Get outgoing relationships
    this.stmtGetOutgoing = db.prepare(`
      SELECT * FROM symbol_relationships
      WHERE from_symbol_id = ?
      ORDER BY weight DESC, confidence DESC
    `);

    // Get incoming relationships
    this.stmtGetIncoming = db.prepare(`
      SELECT * FROM symbol_relationships
      WHERE to_symbol_id = ?
      ORDER BY weight DESC, confidence DESC
    `);

    // Get bidirectional relationships
    this.stmtGetBidirectional = db.prepare(`
      SELECT * FROM symbol_relationships
      WHERE from_symbol_id = ? OR to_symbol_id = ?
      ORDER BY weight DESC, confidence DESC
    `);

    // Count by type
    this.stmtCountByType = db.prepare(`
      SELECT relationship_type, COUNT(*) as count
      FROM symbol_relationships
      GROUP BY relationship_type
    `);

    // Centrality calculation
    this.stmtCentrality = db.prepare(`
      SELECT
        s.symbol_id,
        COALESCE(out_rel.out_count, 0) as out_degree,
        COALESCE(in_rel.in_count, 0) as in_degree,
        COALESCE(out_rel.out_count, 0) + COALESCE(in_rel.in_count, 0) as total_degree,
        COALESCE(out_rel.out_weight, 0) + COALESCE(in_rel.in_weight, 0) as weighted_degree
      FROM symbols s
      LEFT JOIN (
        SELECT from_symbol_id, COUNT(*) as out_count, SUM(weight) as out_weight
        FROM symbol_relationships
        GROUP BY from_symbol_id
      ) out_rel ON s.symbol_id = out_rel.from_symbol_id
      LEFT JOIN (
        SELECT to_symbol_id, COUNT(*) as in_count, SUM(weight) as in_weight
        FROM symbol_relationships
        GROUP BY to_symbol_id
      ) in_rel ON s.symbol_id = in_rel.to_symbol_id
      ORDER BY total_degree DESC
      LIMIT ?
    `);

    this.initialized = true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RELATIONSHIP CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new relationship between symbols.
   */
  createRelationship(request: CreateRelationshipRequest): {
    success: boolean;
    relationshipId?: number;
    error?: string;
  } {
    this.ensureInitialized();

    try {
      const category = RELATIONSHIP_CATEGORIES[request.relationshipType];

      const result = this.stmtInsertRelationship.run({
        from_symbol_id: request.fromSymbolId,
        to_symbol_id: request.toSymbolId,
        relationship_type: request.relationshipType,
        category,
        weight: request.weight ?? 1.0,
        confidence: request.confidence ?? 1.0,
        properties: request.properties ? JSON.stringify(request.properties) : null,
        evidence: request.evidence ?? null,
        created_at: new Date().toISOString(),
        created_by: request.createdBy ?? null,
      });

      // Create inverse relationship if bidirectional
      if (request.bidirectional) {
        const inverseType = INVERSE_RELATIONSHIPS[request.relationshipType];
        if (inverseType) {
          this.stmtInsertRelationship.run({
            from_symbol_id: request.toSymbolId,
            to_symbol_id: request.fromSymbolId,
            relationship_type: inverseType,
            category: RELATIONSHIP_CATEGORIES[inverseType],
            weight: request.weight ?? 1.0,
            confidence: request.confidence ?? 1.0,
            properties: request.properties ? JSON.stringify(request.properties) : null,
            evidence: request.evidence ?? null,
            created_at: new Date().toISOString(),
            created_by: request.createdBy ?? null,
          });
        }
      }

      return { success: true, relationshipId: result.lastInsertRowid as number };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Relationship already exists' };
      }
      if (msg.includes('FOREIGN KEY constraint failed')) {
        return { success: false, error: 'One or both symbols do not exist' };
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Get a relationship by ID.
   */
  getRelationship(id: number): SymbolRelationship | null {
    this.ensureInitialized();
    const row = this.stmtGetRelationship.get(id) as RelationshipRow | undefined;
    if (!row) return null;
    return this.rowToRelationship(row);
  }

  /**
   * Delete a relationship by ID.
   */
  deleteRelationship(id: number): boolean {
    this.ensureInitialized();
    const result = this.stmtDeleteRelationship.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all relationships involving a symbol.
   */
  deleteSymbolRelationships(symbolId: string): number {
    this.ensureInitialized();
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM symbol_relationships
      WHERE from_symbol_id = ? OR to_symbol_id = ?
    `).run(symbolId, symbolId);
    return result.changes;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RELATIONSHIP QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all relationships from a symbol (outgoing).
   */
  getOutgoingRelationships(
    symbolId: string,
    options?: RelationshipQueryOptions
  ): SymbolRelationship[] {
    this.ensureInitialized();
    return this.filterRelationships(
      this.stmtGetOutgoing.all(symbolId) as RelationshipRow[],
      options
    );
  }

  /**
   * Get all relationships to a symbol (incoming).
   */
  getIncomingRelationships(
    symbolId: string,
    options?: RelationshipQueryOptions
  ): SymbolRelationship[] {
    this.ensureInitialized();
    return this.filterRelationships(
      this.stmtGetIncoming.all(symbolId) as RelationshipRow[],
      options
    );
  }

  /**
   * Get all related symbols (both directions).
   */
  getRelatedSymbols(
    symbolId: string,
    options?: RelationshipQueryOptions
  ): RelatedSymbolsResult {
    this.ensureInitialized();

    const rows = this.stmtGetBidirectional.all(symbolId, symbolId) as RelationshipRow[];
    const filtered = this.filterRelationships(rows, options);

    const related: RelatedSymbolsResult['related'] = [];
    const countByType: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;

    for (const rel of filtered) {
      const isOutgoing = rel.fromSymbolId === symbolId;
      const relatedId = isOutgoing ? rel.toSymbolId : rel.fromSymbolId;

      related.push({
        symbolId: relatedId,
        relationship: rel.relationshipType,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        weight: rel.weight,
        confidence: rel.confidence,
      });

      countByType[rel.relationshipType] = (countByType[rel.relationshipType] || 0) + 1;
    }

    return { symbolId, related, countByType };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GRAPH TRAVERSAL
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the neighborhood of a symbol (N-hop traversal).
   * Uses recursive CTE for efficient graph traversal.
   */
  getNeighborhood(
    symbolId: string,
    options?: TraversalOptions
  ): NeighborhoodResult {
    this.ensureInitialized();

    const maxDepth = options?.maxDepth ?? 2;
    const minWeight = options?.minWeight ?? 0;
    const bidirectional = options?.bidirectional ?? true;
    const limit = options?.limit ?? 100;

    const db = getDatabase();

    // Build relationship type filter
    let typeFilter = '';
    const typeParams: string[] = [];
    if (options?.relationshipTypes && options.relationshipTypes.length > 0) {
      typeFilter = `AND r.relationship_type IN (${options.relationshipTypes.map(() => '?').join(',')})`;
      typeParams.push(...options.relationshipTypes);
    } else if (options?.categories && options.categories.length > 0) {
      typeFilter = `AND r.category IN (${options.categories.map(() => '?').join(',')})`;
      typeParams.push(...options.categories);
    }

    // Recursive CTE for neighborhood traversal
    const direction = bidirectional
      ? `(r.from_symbol_id = n.node_id OR r.to_symbol_id = n.node_id)`
      : `r.from_symbol_id = n.node_id`;

    const nextNode = bidirectional
      ? `CASE WHEN r.from_symbol_id = n.node_id THEN r.to_symbol_id ELSE r.from_symbol_id END`
      : `r.to_symbol_id`;

    const query = `
      WITH RECURSIVE neighborhood(node_id, depth, path, path_relationships, path_weight, via_relationship, via_node) AS (
        -- Base case: starting node
        SELECT
          ? AS node_id,
          0 AS depth,
          ? AS path,
          '' AS path_relationships,
          0.0 AS path_weight,
          NULL AS via_relationship,
          NULL AS via_node

        UNION ALL

        -- Recursive case: expand outward
        SELECT
          ${nextNode},
          n.depth + 1,
          n.path || ',' || ${nextNode},
          CASE WHEN n.path_relationships = ''
               THEN r.relationship_type
               ELSE n.path_relationships || ',' || r.relationship_type END,
          n.path_weight + r.weight,
          r.relationship_type,
          n.node_id
        FROM neighborhood n
        JOIN symbol_relationships r ON ${direction}
        WHERE n.depth < ?
          AND r.weight >= ?
          ${typeFilter}
          AND n.path NOT LIKE '%' || ${nextNode} || '%'
      )
      SELECT DISTINCT
        node_id,
        MIN(depth) as depth,
        path,
        path_relationships,
        path_weight,
        via_relationship,
        via_node
      FROM neighborhood
      WHERE node_id != ?
      GROUP BY node_id
      ORDER BY depth, path_weight DESC
      LIMIT ?
    `;

    const params = [symbolId, symbolId, maxDepth, minWeight, ...typeParams, symbolId, limit];
    const rows = db.prepare(query).all(...params) as TraversalRow[];

    // Build result
    const nodes: TraversalNode[] = rows.map(row => ({
      symbolId: row.node_id,
      depth: row.depth,
      path: options?.includePaths ? row.path.split(',') : undefined,
      pathRelationships: options?.includePaths
        ? row.path_relationships.split(',').filter(r => r) as RelationshipType[]
        : undefined,
      pathWeight: row.path_weight,
      viaRelationship: row.via_relationship as RelationshipType | undefined,
      viaNode: row.via_node ?? undefined,
    }));

    // Calculate statistics
    const nodesAtDepth: Record<number, number> = {};
    const byRelationshipType: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;

    for (const node of nodes) {
      nodesAtDepth[node.depth] = (nodesAtDepth[node.depth] || 0) + 1;
      if (node.viaRelationship) {
        byRelationshipType[node.viaRelationship] =
          (byRelationshipType[node.viaRelationship] || 0) + 1;
      }
    }

    return {
      startSymbol: symbolId,
      nodes,
      edgesTraversed: nodes.length,
      stats: { nodesAtDepth, byRelationshipType },
    };
  }

  /**
   * Find paths between two symbols.
   * Uses recursive CTE with cycle detection.
   */
  findPaths(
    fromSymbolId: string,
    toSymbolId: string,
    options?: TraversalOptions
  ): PathResult {
    this.ensureInitialized();

    const maxDepth = options?.maxDepth ?? 5;
    const minWeight = options?.minWeight ?? 0;
    const bidirectional = options?.bidirectional ?? true;
    const limit = options?.limit ?? 10;

    const db = getDatabase();

    // Build relationship type filter
    let typeFilter = '';
    const typeParams: string[] = [];
    if (options?.relationshipTypes && options.relationshipTypes.length > 0) {
      typeFilter = `AND r.relationship_type IN (${options.relationshipTypes.map(() => '?').join(',')})`;
      typeParams.push(...options.relationshipTypes);
    }

    const direction = bidirectional
      ? `(r.from_symbol_id = p.current_node OR r.to_symbol_id = p.current_node)`
      : `r.from_symbol_id = p.current_node`;

    const nextNode = bidirectional
      ? `CASE WHEN r.from_symbol_id = p.current_node THEN r.to_symbol_id ELSE r.from_symbol_id END`
      : `r.to_symbol_id`;

    const query = `
      WITH RECURSIVE all_paths(
        current_node,
        path,
        path_relationships,
        depth,
        total_weight,
        min_confidence
      ) AS (
        SELECT
          ?,
          ?,
          '',
          0,
          0.0,
          1.0

        UNION ALL

        SELECT
          ${nextNode},
          p.path || ',' || ${nextNode},
          CASE WHEN p.path_relationships = ''
               THEN r.relationship_type
               ELSE p.path_relationships || ',' || r.relationship_type END,
          p.depth + 1,
          p.total_weight + r.weight,
          MIN(p.min_confidence, r.confidence)
        FROM all_paths p
        JOIN symbol_relationships r ON ${direction}
        WHERE p.depth < ?
          AND r.weight >= ?
          ${typeFilter}
          AND p.path NOT LIKE '%' || ${nextNode} || '%'
      )
      SELECT
        path,
        path_relationships,
        depth,
        total_weight,
        min_confidence
      FROM all_paths
      WHERE current_node = ?
      ORDER BY depth ASC, total_weight DESC
      LIMIT ?
    `;

    const params = [fromSymbolId, fromSymbolId, maxDepth, minWeight, ...typeParams, toSymbolId, limit];
    const rows = db.prepare(query).all(...params) as {
      path: string;
      path_relationships: string;
      depth: number;
      total_weight: number;
      min_confidence: number;
    }[];

    const paths: PathInfo[] = rows.map(row => ({
      nodes: row.path.split(','),
      relationships: row.path_relationships.split(',').filter(r => r) as RelationshipType[],
      length: row.depth,
      totalWeight: row.total_weight,
      minConfidence: row.min_confidence,
    }));

    return {
      from: fromSymbolId,
      to: toSymbolId,
      found: paths.length > 0,
      paths,
    };
  }

  /**
   * Find the shortest path between two symbols.
   */
  findShortestPath(
    fromSymbolId: string,
    toSymbolId: string,
    options?: TraversalOptions
  ): PathInfo | null {
    const result = this.findPaths(fromSymbolId, toSymbolId, { ...options, limit: 1 });
    return result.found ? result.paths[0] : null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GRAPH ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get centrality metrics for top symbols.
   */
  getTopSymbolsByCentrality(limit: number = 10): SymbolCentrality[] {
    this.ensureInitialized();
    const rows = this.stmtCentrality.all(limit) as CentralityRow[];

    return rows.map(row => ({
      symbolId: row.symbol_id,
      degreeCentrality: row.total_degree,
      inDegree: row.in_degree,
      outDegree: row.out_degree,
      weightedDegree: row.weighted_degree,
    }));
  }

  /**
   * Get graph-level statistics.
   */
  getGraphStats(): GraphStats {
    this.ensureInitialized();
    const db = getDatabase();

    // Node count
    const nodeCountRow = db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number };

    // Edge count
    const edgeCountRow = db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as { count: number };

    // Relationship type distribution
    const typeRows = this.stmtCountByType.all() as { relationship_type: string; count: number }[];
    const relationshipDistribution: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;
    for (const row of typeRows) {
      relationshipDistribution[row.relationship_type as RelationshipType] = row.count;
    }

    // Category distribution
    const categoryRows = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM symbol_relationships
      GROUP BY category
    `).all() as { category: string; count: number }[];
    const categoryDistribution: Record<RelationshipCategory, number> = {} as Record<RelationshipCategory, number>;
    for (const row of categoryRows) {
      categoryDistribution[row.category as RelationshipCategory] = row.count;
    }

    // Top symbols by centrality
    const topSymbols = this.getTopSymbolsByCentrality(10);

    // Graph density
    const nodeCount = nodeCountRow.count;
    const edgeCount = edgeCountRow.count;
    const possibleEdges = nodeCount * (nodeCount - 1); // Directed graph
    const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

    // Average degree
    const averageDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

    return {
      nodeCount,
      edgeCount,
      averageDegree,
      relationshipDistribution,
      categoryDistribution,
      topSymbolsByCentrality: topSymbols,
      density,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BULK OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create multiple relationships in a transaction.
   */
  createRelationshipsBatch(
    requests: CreateRelationshipRequest[]
  ): { success: boolean; created: number; errors: string[] } {
    this.ensureInitialized();
    const db = getDatabase();

    let created = 0;
    const errors: string[] = [];

    db.transaction(() => {
      for (const request of requests) {
        const result = this.createRelationship(request);
        if (result.success) {
          created++;
        } else if (result.error) {
          errors.push(`${request.fromSymbolId} -> ${request.toSymbolId}: ${result.error}`);
        }
      }
    });

    return { success: errors.length === 0, created, errors };
  }

  /**
   * Import relationships from extracted document data.
   */
  importExtractedRelationships(
    relationships: Array<{
      from: string;
      to: string;
      type: RelationshipType;
      confidence: number;
      evidence?: string;
    }>,
    options?: { createdBy?: string; minConfidence?: number }
  ): { imported: number; skipped: number } {
    this.ensureInitialized();

    const minConfidence = options?.minConfidence ?? 0.5;
    let imported = 0;
    let skipped = 0;

    const db = getDatabase();
    db.transaction(() => {
      for (const rel of relationships) {
        if (rel.confidence < minConfidence) {
          skipped++;
          continue;
        }

        const result = this.createRelationship({
          fromSymbolId: rel.from,
          toSymbolId: rel.to,
          relationshipType: rel.type,
          confidence: rel.confidence,
          evidence: rel.evidence,
          createdBy: options?.createdBy,
        });

        if (result.success) {
          imported++;
        } else {
          skipped++;
        }
      }
    });

    return { imported, skipped };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  private rowToRelationship(row: RelationshipRow): SymbolRelationship {
    return {
      id: row.id,
      fromSymbolId: row.from_symbol_id,
      toSymbolId: row.to_symbol_id,
      relationshipType: row.relationship_type as RelationshipType,
      category: row.category as RelationshipCategory,
      weight: row.weight,
      confidence: row.confidence,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
      evidence: row.evidence ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by ?? undefined,
    };
  }

  private filterRelationships(
    rows: RelationshipRow[],
    options?: RelationshipQueryOptions
  ): SymbolRelationship[] {
    let relationships = rows.map(row => this.rowToRelationship(row));

    if (options?.types && options.types.length > 0) {
      relationships = relationships.filter(r => options.types!.includes(r.relationshipType));
    }

    if (options?.categories && options.categories.length > 0) {
      relationships = relationships.filter(r => options.categories!.includes(r.category));
    }

    if (options?.minWeight !== undefined) {
      relationships = relationships.filter(r => r.weight >= options.minWeight!);
    }

    if (options?.minConfidence !== undefined) {
      relationships = relationships.filter(r => r.confidence >= options.minConfidence!);
    }

    if (options?.orderBy) {
      const dir = options.orderDirection === 'ASC' ? 1 : -1;
      relationships.sort((a, b) => {
        const aVal = a[options.orderBy!];
        const bVal = b[options.orderBy!];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * dir;
        }
        return String(aVal).localeCompare(String(bVal)) * dir;
      });
    }

    if (options?.limit) {
      relationships = relationships.slice(0, options.limit);
    }

    return relationships;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let graphManager: GraphManager | null = null;

export function getGraphManager(): GraphManager {
  if (!graphManager) {
    graphManager = new GraphManager();
  }
  return graphManager;
}

export function resetGraphManager(): void {
  graphManager = null;
}
