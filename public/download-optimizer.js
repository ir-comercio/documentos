// download-optimizer.js - Otimização de Downloads e Cache

class DownloadOptimizer {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    }
    
    // Gerar link de download direto (mais rápido)
    getDirectDownloadLink(fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    
    // Gerar link de visualização (para PDFs, imagens)
    getPreviewLink(fileId, mimetype) {
        if (mimetype?.includes('pdf')) {
            return `https://drive.google.com/file/d/${fileId}/preview`;
        }
        if (mimetype?.startsWith('image/')) {
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        }
        return this.getDirectDownloadLink(fileId);
    }
    
    // Cache de metadados de arquivos
    cacheFileMetadata(fileId, metadata) {
        this.cache.set(fileId, {
            data: metadata,
            timestamp: Date.now()
        });
        
        // Limpar cache antigo
        setTimeout(() => {
            this.cache.delete(fileId);
        }, this.cacheTimeout);
    }
    
    // Obter do cache
    getCachedMetadata(fileId) {
        const cached = this.cache.get(fileId);
        
        if (!cached) return null;
        
        // Verificar se ainda está válido
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(fileId);
            return null;
        }
        
        return cached.data;
    }
    
    // Gerar links otimizados para todos os arquivos
    generateOptimizedLinks(files) {
        return files.map(file => ({
            ...file,
            directDownloadLink: this.getDirectDownloadLink(file.google_drive_id),
            previewLink: this.getPreviewLink(file.google_drive_id, file.mimetype),
            thumbnailLink: file.mimetype?.startsWith('image/') 
                ? `https://drive.google.com/thumbnail?id=${file.google_drive_id}&sz=w200`
                : null
        }));
    }
}

module.exports = DownloadOptimizer;
