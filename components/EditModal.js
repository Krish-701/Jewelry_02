'use client';

import { useState } from 'react';

export default function EditModal({ isOpen, onClose, item, onSubmit }) {
    const [editPrompt, setEditPrompt] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !item) return null;

    const getImageSrc = () => {
        if (item.imageUrl) return item.imageUrl;
        if (item.data) return `data:${item.mimeType || 'image/jpeg'};base64,${item.data}`;
        return '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!editPrompt.trim()) return;
        
        setIsSubmitting(true);
        try {
            await onSubmit(item, editPrompt.trim());
            setEditPrompt('');
            onClose();
        } catch (err) {
            console.error('Edit failed:', err);
            alert('Failed to edit image: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setEditPrompt('');
            onClose();
        }
    };

    return (
        <div className="edit-modal-overlay" onClick={handleClose}>
            <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="edit-modal-header">
                    <h3>✏️ Edit Image</h3>
                    <button className="edit-modal-close" onClick={handleClose} disabled={isSubmitting}>×</button>
                </div>

                <div className="edit-modal-content">
                    {/* Original Image Preview */}
                    <div className="edit-modal-image-section">
                        <label>Original Image</label>
                        <div className="edit-modal-image-wrap">
                            <img 
                                src={getImageSrc()} 
                                alt="Original" 
                                className="edit-modal-image"
                            />
                        </div>
                    </div>

                    {/* Edit Form */}
                    <form onSubmit={handleSubmit} className="edit-modal-form">
                        <div className="edit-modal-field">
                            <label htmlFor="edit-prompt">
                                What changes do you want to make?
                                <span className="edit-modal-hint">
                                    Describe how you want to modify this image
                                </span>
                            </label>
                            <textarea
                                id="edit-prompt"
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                placeholder="e.g., Change the background to a beach scene, make the lighting softer, add more gold details..."
                                rows={4}
                                disabled={isSubmitting}
                                autoFocus
                            />
                        </div>

                        <div className="edit-modal-actions">
                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handleClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={!editPrompt.trim() || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="edit-modal-spinner"></span>
                                        Generating...
                                    </>
                                ) : (
                                    '✨ Generate Edit'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
