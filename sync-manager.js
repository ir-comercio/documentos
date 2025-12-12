// sync-manager.js - Gerenciador de Sincronização Google Drive ↔ Supabase

class SyncManager {
    constructor(driveClient, supabase) {
        this.driveClient = driveClient;
        this.supabase = supabase;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.syncInterval = null;
    }
    
    // Iniciar sincronização automática
    startAutoSync(intervalMs = 300000) {
        console.log(`🔄 Sincronização automática iniciada (intervalo: ${intervalMs/1000}s)`);
        
        // Sincronizar imediatamente
        this.syncNow();
        
        // Agendar sincronizações periódicas
        this.syncInterval = setInterval(async () => {
            await this.syncNow();
        }, intervalMs);
    }
    
    // Parar sincronização
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏸️ Sincronização pausada');
        }
    }
    
    // Sincronizar agora
    async syncNow() {
        if (this.isSyncing) {
            console.log('⏭️ Sincronização em andamento, pulando...');
            return { skipped: true };
        }
        
        this.isSyncing = true;
        const startTime = Date.now();
        
        console.log('🔄 Iniciando sincronização...');
        
        try {
            const result = await this.fullSync();
            
            this.lastSyncTime = new Date();
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            console.log(`✅ Sincronização concluída em ${duration}s:`, result);
            
            return result;
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }
    
    // Sincronização completa
    async fullSync() {
        let stats = {
            added: 0,
            updated: 0,
            deleted: 0,
            errors: 0
        };
        
        // 1. Buscar estrutura do Google Drive
        const driveItems = await this.driveClient.getFullStructure();
        
        // 2. Buscar estrutura do Supabase
        const { data: dbItems, error } = await this.supabase
            .from('documents')
            .select('*');
        
        if (error) throw error;
        
        // Criar mapas
        const driveMap = new Map(driveItems.map(item => [item.id, item]));
        const dbMap = new Map(dbItems.map(item => [item.google_drive_id, item]));
        
        // 3. Processar itens do Drive
        for (const driveItem of driveItems) {
            try {
                const dbItem = dbMap.get(driveItem.id);
                
                if (!dbItem) {
                    // NOVO - Adicionar
                    await this.addItemToDatabase(driveItem);
                    stats.added++;
                } else {
                    // EXISTENTE - Verificar se modificado
                    const driveModified = new Date(driveItem.modifiedTime);
                    const dbModified = new Date(dbItem.google_modified_at);
                    
                    if (driveModified > dbModified) {
                        await this.updateItemInDatabase(driveItem);
                        stats.updated++;
                    }
                    
                    dbMap.delete(driveItem.id);
                }
            } catch (error) {
                console.error(`Erro ao processar ${driveItem.name}:`, error);
                stats.errors++;
            }
        }
        
        // 4. Itens deletados no Drive
        for (const [driveId, dbItem] of dbMap) {
            try {
                await this.supabase
                    .from('documents')
                    .delete()
                    .eq('google_drive_id', driveId);
                
                stats.deleted++;
            } catch (error) {
                console.error(`Erro ao deletar ${dbItem.name}:`, error);
                stats.errors++;
            }
        }
        
        return stats;
    }
    
    // Adicionar item ao database
    async addItemToDatabase(driveItem) {
        const isFolder = driveItem.mimeType === 'application/vnd.google-apps.folder';
        
        const { error } = await this.supabase
            .from('documents')
            .insert({
                name: driveItem.name,
                folder_path: driveItem.folderPath,
                google_drive_id: driveItem.id,
                parent_id: driveItem.parents ? driveItem.parents[0] : null,
                web_view_link: driveItem.webViewLink,
                web_content_link: driveItem.webContentLink,
                thumbnail_link: driveItem.thumbnailLink,
                size: parseInt(driveItem.size) || 0,
                mimetype: driveItem.mimeType,
                is_folder: isFolder,
                google_created_at: driveItem.createdTime,
                google_modified_at: driveItem.modifiedTime
            });
        
        if (error) throw error;
    }
    
    // Atualizar item no database
    async updateItemInDatabase(driveItem) {
        const { error } = await this.supabase
            .from('documents')
            .update({
                name: driveItem.name,
                web_content_link: driveItem.webContentLink,
                thumbnail_link: driveItem.thumbnailLink,
                size: parseInt(driveItem.size) || 0,
                google_modified_at: driveItem.modifiedTime
            })
            .eq('google_drive_id', driveItem.id);
        
        if (error) throw error;
    }
    
    // Obter status
    getStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            autoSyncActive: this.syncInterval !== null
        };
    }
}

module.exports = SyncManager;
