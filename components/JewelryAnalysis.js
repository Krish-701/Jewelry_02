'use client';

export default function JewelryAnalysis({ analysis }) {
    if (!analysis) return null;

    return (
        <div className="glass-card analysis-panel">
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔍</span> AI Jewelry Analysis
            </h3>

            {analysis.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                    {analysis.description}
                </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {analysis.type && (
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{analysis.type}</p>
                    </div>
                )}
                {analysis.style && (
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Style</span>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{analysis.style}</p>
                    </div>
                )}
                {analysis.material && (
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Material</span>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{analysis.material}</p>
                    </div>
                )}
                {analysis.occasion && (
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Occasion</span>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{analysis.occasion}</p>
                    </div>
                )}
            </div>

            {analysis.pieces?.length > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Focus pieces detected
                    </span>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {analysis.pieces.map((piece, i) => (
                            <div key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{piece.type || `Piece ${i + 1}`}</strong>
                                {piece.estimatedSize && (
                                    <span> — AI size estimate: {piece.estimatedSize}</span>
                                )}
                                {piece.description && <span> ({piece.description})</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {analysis.stones?.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stones</span>
                    <div className="analysis-tags">
                        {analysis.stones.map((stone, i) => (
                            <span key={i} className="analysis-tag">💎 {stone}</span>
                        ))}
                    </div>
                </div>
            )}

            {analysis.colors?.length > 0 && (
                <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Colors</span>
                    <div className="analysis-tags">
                        {analysis.colors.map((color, i) => (
                            <span key={i} className="analysis-tag">🎨 {color}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
