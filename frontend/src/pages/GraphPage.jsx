import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { graphAPI } from '../api';
import { trackScreenView } from '../analytics';

export default function GraphPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState(null);
  const [filterLabel, setFilterLabel] = useState('');
  const fgRef = useRef();
  const ForceGraph = useRef(null);
  const [graphReady, setGraphReady] = useState(false);

  useEffect(() => { trackScreenView('Graph'); }, []);

  // Dynamic import for react-force-graph-2d (heavy library)
  useEffect(() => {
    import('react-force-graph-2d').then(mod => {
      ForceGraph.current = mod.default;
      setGraphReady(true);
    });
  }, []);

  useEffect(() => {
    loadGraph();
  }, []);

  async function loadGraph() {
    try {
      const data = await graphAPI.get();
      setGraphData({
        nodes: data.nodes || [],
        links: data.links || [],
      });
    } catch (err) {
      console.error('Graph load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // Get unique labels for filter
  const labels = [...new Set(graphData.nodes.map(n => n.label))].sort();

  // Filter nodes/links
  const filteredData = filterLabel ? {
    nodes: graphData.nodes.filter(n => n.label === filterLabel),
    links: graphData.links.filter(l => {
      const nodeIds = new Set(graphData.nodes.filter(n => n.label === filterLabel).map(n => n.id));
      return nodeIds.has(l.source?.id || l.source) && nodeIds.has(l.target?.id || l.target);
    }),
  } : graphData;

  const handleNodeClick = useCallback((node) => {
    navigate(`/vault/${node.id}`);
  }, [navigate]);

  if (loading || !graphReady) {
    return (
      <div className="chat-page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const Graph = ForceGraph.current;

  return (
    <div className="chat-page-container" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', background: 'rgba(14,14,14,0.8)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/vault')} style={{
            background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '0.875rem',
          }}>← {lang === 'tr' ? 'Geri' : 'Back'}</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--on-surface)', fontSize: '1rem' }}>
            {lang === 'tr' ? 'Bilgi Haritası' : 'Knowledge Graph'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--outline)' }}>
            {filteredData.nodes.length} {lang === 'tr' ? 'not' : 'notes'} · {filteredData.links.length} {lang === 'tr' ? 'bağlantı' : 'links'}
          </span>
        </div>
        {/* Label filter */}
        <select
          value={filterLabel}
          onChange={e => setFilterLabel(e.target.value)}
          style={{
            background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-full)', color: 'var(--on-surface)',
            padding: '6px 12px', fontSize: '0.75rem', outline: 'none',
          }}
        >
          <option value="">{lang === 'tr' ? 'Tümü' : 'All Topics'}</option>
          {labels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Hover tooltip */}
      {hoverNode && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)', padding: '8px 16px',
          fontSize: '0.8125rem', color: 'var(--on-surface)', maxWidth: 300, textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <strong>{hoverNode.title}</strong>
          <div style={{ fontSize: '0.7rem', color: hoverNode.color, marginTop: 2 }}>{hoverNode.label}</div>
        </div>
      )}

      {/* Graph */}
      {Graph && (
        <Graph
          ref={fgRef}
          graphData={filteredData}
          backgroundColor="#0e0e0e"
          nodeColor={node => node.color || '#9093ff'}
          nodeVal={node => node.size || 3}
          nodeLabel=""
          linkColor={() => 'rgba(183,159,255,0.15)'}
          linkWidth={link => Math.max(0.5, (link.score || 0.3) * 2)}
          onNodeClick={handleNodeClick}
          onNodeHover={node => setHoverNode(node || null)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            // Draw circle
            const r = Math.sqrt(node.size || 3) * 2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = node.color || '#9093ff';
            ctx.fill();

            // Draw glow
            ctx.shadowColor = node.color || '#9093ff';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Draw label if zoomed in enough
            if (globalScale > 1.5) {
              ctx.font = `${10 / globalScale}px JetBrains Mono, monospace`;
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.textAlign = 'center';
              ctx.fillText((node.title || '').substring(0, 25), node.x, node.y + r + 8 / globalScale);
            }
          }}
          width={typeof window !== 'undefined' ? window.innerWidth - 280 : 800}
          height={typeof window !== 'undefined' ? window.innerHeight : 600}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  );
}
