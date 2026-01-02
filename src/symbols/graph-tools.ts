/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK GRAPH MCP TOOLS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * MCP tool definitions and handlers for graph traversal operations.
 * Based on Microsoft GraphRAG research showing 26.5% reasoning improvement
 * from graph-based context retrieval.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getGraphManager } from './graph-manager.js';
import type {
  RelationshipType,
  RelationshipCategory,
  CreateRelationshipRequest,
  RelationshipQueryOptions,
  TraversalOptions,
} from './graph-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const graphToolDefinitions: Tool[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_relate
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_relate',
    description: `Create a relationship between two symbols.

Relationship types by category:
- CAUSAL: CAUSES, TRIGGERS, LEADS_TO, RESULTS_IN, ENABLES, PREVENTS
- TEMPORAL: PRECEDES, FOLLOWS, CONCURRENT_WITH, SUPERSEDES, SUPERSEDED_BY
- HIERARCHICAL: PARENT_OF, CHILD_OF, CONTAINS, PART_OF, ELABORATES, SUMMARIZES
- ASSOCIATIVE: RELATED_TO, REFERENCES, SIMILAR_TO, CONTRASTS_WITH, COMPLEMENTS
- COMPETITIVE: COMPETES_WITH, OUTPERFORMS, UNDERPERFORMS, DISRUPTS, CHALLENGES
- DEPENDENCY: DEPENDS_ON, REQUIRES, SUPPORTS, BLOCKS, EXPOSED_TO
- OWNERSHIP: OWNS, CONTROLS, SUBSIDIARY_OF, ACQUIRED_BY, MERGED_WITH, PARTNERS_WITH
- REGULATORY: REGULATED_BY, COMPLIANT_WITH, SUBJECT_TO, FILED_WITH, AUDITED_BY`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromSymbolId: {
          type: 'string',
          description: 'Source symbol ID (e.g., Ξ.NVDA.Q3FY25)',
        },
        toSymbolId: {
          type: 'string',
          description: 'Target symbol ID (e.g., Ξ.NVDA.Q4FY25)',
        },
        relationshipType: {
          type: 'string',
          enum: [
            'CAUSES', 'TRIGGERS', 'LEADS_TO', 'RESULTS_IN', 'ENABLES', 'PREVENTS',
            'PRECEDES', 'FOLLOWS', 'CONCURRENT_WITH', 'SUPERSEDES', 'SUPERSEDED_BY',
            'PARENT_OF', 'CHILD_OF', 'CONTAINS', 'PART_OF', 'ELABORATES', 'SUMMARIZES',
            'RELATED_TO', 'REFERENCES', 'SIMILAR_TO', 'CONTRASTS_WITH', 'COMPLEMENTS',
            'COMPETES_WITH', 'OUTPERFORMS', 'UNDERPERFORMS', 'DISRUPTS', 'CHALLENGES',
            'DEPENDS_ON', 'REQUIRES', 'SUPPORTS', 'BLOCKS', 'EXPOSED_TO',
            'OWNS', 'CONTROLS', 'SUBSIDIARY_OF', 'ACQUIRED_BY', 'MERGED_WITH', 'PARTNERS_WITH',
            'REGULATED_BY', 'COMPLIANT_WITH', 'SUBJECT_TO', 'FILED_WITH', 'AUDITED_BY',
          ],
          description: 'Type of relationship',
        },
        weight: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Relationship strength (0.0-1.0, default: 1.0)',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Extraction confidence (0.0-1.0, default: 1.0)',
        },
        evidence: {
          type: 'string',
          description: 'Text evidence for this relationship',
        },
        bidirectional: {
          type: 'boolean',
          description: 'Also create inverse relationship (default: false)',
        },
        properties: {
          type: 'object' as const,
          description: 'Additional properties (source, validFrom, percentage, etc.)',
        },
      },
      required: ['fromSymbolId', 'toSymbolId', 'relationshipType'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_related
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_related',
    description: 'Get symbols directly related to a given symbol (1-hop neighbors).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to find related symbols for',
        },
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming', 'both'],
          description: 'Relationship direction (default: both)',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship types',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship categories',
        },
        minWeight: {
          type: 'number',
          description: 'Minimum relationship weight',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum relationship confidence',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
        },
      },
      required: ['symbolId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_neighborhood
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_neighborhood',
    description: `Get the N-hop neighborhood of a symbol (GraphRAG subgraph retrieval).
Returns all symbols reachable within maxDepth hops, with path information.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Starting symbol ID',
        },
        maxDepth: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Maximum traversal depth (1-5, default: 2)',
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship types',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship categories',
        },
        minWeight: {
          type: 'number',
          description: 'Minimum weight for traversal',
        },
        bidirectional: {
          type: 'boolean',
          description: 'Traverse both directions (default: true)',
        },
        includePaths: {
          type: 'boolean',
          description: 'Include path information in results (default: false)',
        },
        limit: {
          type: 'number',
          description: 'Maximum nodes to return (default: 100)',
        },
      },
      required: ['symbolId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_path
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_path',
    description: `Find paths between two symbols.
Returns all paths within maxDepth, sorted by length and weight.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromSymbolId: {
          type: 'string',
          description: 'Starting symbol ID',
        },
        toSymbolId: {
          type: 'string',
          description: 'Target symbol ID',
        },
        maxDepth: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Maximum path length (1-10, default: 5)',
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship types',
        },
        minWeight: {
          type: 'number',
          description: 'Minimum weight for edges',
        },
        bidirectional: {
          type: 'boolean',
          description: 'Allow traversal in both directions (default: true)',
        },
        limit: {
          type: 'number',
          description: 'Maximum paths to return (default: 10)',
        },
      },
      required: ['fromSymbolId', 'toSymbolId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_shortest_path
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_shortest_path',
    description: 'Find the shortest path between two symbols.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromSymbolId: {
          type: 'string',
          description: 'Starting symbol ID',
        },
        toSymbolId: {
          type: 'string',
          description: 'Target symbol ID',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum search depth (default: 5)',
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship types',
        },
        bidirectional: {
          type: 'boolean',
          description: 'Allow traversal in both directions (default: true)',
        },
      },
      required: ['fromSymbolId', 'toSymbolId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_centrality
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_centrality',
    description: 'Get top symbols by centrality (most connected symbols in the knowledge graph).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top symbols to return (default: 10)',
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_stats
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_stats',
    description: 'Get statistics about the symbol relationship graph.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_delete_relationship
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_delete_relationship',
    description: 'Delete a relationship by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        relationshipId: {
          type: 'number',
          description: 'ID of the relationship to delete',
        },
      },
      required: ['relationshipId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_graph_batch_relate
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_graph_batch_relate',
    description: 'Create multiple relationships in a single transaction.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        relationships: {
          type: 'array',
          items: {
            type: 'object' as const,
            properties: {
              fromSymbolId: { type: 'string' },
              toSymbolId: { type: 'string' },
              relationshipType: { type: 'string' },
              weight: { type: 'number' },
              confidence: { type: 'number' },
              evidence: { type: 'string' },
              bidirectional: { type: 'boolean' },
            },
            required: ['fromSymbolId', 'toSymbolId', 'relationshipType'],
          },
          description: 'Array of relationships to create',
        },
      },
      required: ['relationships'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleGraphTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const manager = getGraphManager();

  switch (name) {
    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_relate
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_relate': {
      const request: CreateRelationshipRequest = {
        fromSymbolId: args.fromSymbolId as string,
        toSymbolId: args.toSymbolId as string,
        relationshipType: args.relationshipType as RelationshipType,
        weight: args.weight as number | undefined,
        confidence: args.confidence as number | undefined,
        evidence: args.evidence as string | undefined,
        bidirectional: args.bidirectional as boolean | undefined,
        properties: args.properties as Record<string, unknown> | undefined,
      };
      return manager.createRelationship(request);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_related
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_related': {
      const symbolId = args.symbolId as string;
      const direction = (args.direction as string) || 'both';
      const options: RelationshipQueryOptions = {
        types: args.types as RelationshipType[] | undefined,
        categories: args.categories as RelationshipCategory[] | undefined,
        minWeight: args.minWeight as number | undefined,
        minConfidence: args.minConfidence as number | undefined,
        limit: args.limit as number | undefined,
      };

      if (direction === 'outgoing') {
        return manager.getOutgoingRelationships(symbolId, options);
      } else if (direction === 'incoming') {
        return manager.getIncomingRelationships(symbolId, options);
      } else {
        return manager.getRelatedSymbols(symbolId, options);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_neighborhood
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_neighborhood': {
      const options: TraversalOptions = {
        maxDepth: args.maxDepth as number | undefined,
        relationshipTypes: args.relationshipTypes as RelationshipType[] | undefined,
        categories: args.categories as RelationshipCategory[] | undefined,
        minWeight: args.minWeight as number | undefined,
        bidirectional: args.bidirectional as boolean | undefined,
        includePaths: args.includePaths as boolean | undefined,
        limit: args.limit as number | undefined,
      };
      return manager.getNeighborhood(args.symbolId as string, options);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_path
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_path': {
      const options: TraversalOptions = {
        maxDepth: args.maxDepth as number | undefined,
        relationshipTypes: args.relationshipTypes as RelationshipType[] | undefined,
        minWeight: args.minWeight as number | undefined,
        bidirectional: args.bidirectional as boolean | undefined,
        limit: args.limit as number | undefined,
      };
      return manager.findPaths(
        args.fromSymbolId as string,
        args.toSymbolId as string,
        options
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_shortest_path
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_shortest_path': {
      const options: TraversalOptions = {
        maxDepth: args.maxDepth as number | undefined,
        relationshipTypes: args.relationshipTypes as RelationshipType[] | undefined,
        bidirectional: args.bidirectional as boolean | undefined,
      };
      const result = manager.findShortestPath(
        args.fromSymbolId as string,
        args.toSymbolId as string,
        options
      );
      if (result) {
        return { found: true, path: result };
      }
      return {
        found: false,
        message: `No path found between ${args.fromSymbolId} and ${args.toSymbolId}`,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_centrality
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_centrality': {
      const limit = (args.limit as number) || 10;
      return {
        topSymbols: manager.getTopSymbolsByCentrality(limit),
        timestamp: new Date().toISOString(),
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_stats
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_stats': {
      return {
        graph_stats: manager.getGraphStats(),
        timestamp: new Date().toISOString(),
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_delete_relationship
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_delete_relationship': {
      const deleted = manager.deleteRelationship(args.relationshipId as number);
      return {
        success: deleted,
        message: deleted
          ? `Relationship ${args.relationshipId} deleted`
          : `Relationship ${args.relationshipId} not found`,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ps_graph_batch_relate
    // ─────────────────────────────────────────────────────────────────────────
    case 'ps_graph_batch_relate': {
      const relationships = args.relationships as CreateRelationshipRequest[];
      return manager.createRelationshipsBatch(relationships);
    }

    default:
      throw new Error(`Unknown graph tool: ${name}`);
  }
}
