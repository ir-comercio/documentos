// google-drive-client.js - Operações com Google Drive
const { google } = require('googleapis');
const stream = require('stream');

class GoogleDriveClient {
    constructor(authClient, folderName = 'Documentos') {
        this.authClient = authClient;
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.rootFolderName = folderName;
        this.rootFolderId = null;
    }
    
    // Inicializar pasta raiz
    async initRootFolder() {
        if (this.rootFolderId) return this.rootFolderId;
        
        // Buscar pasta Documentos
        const response = await this.drive.files.list({
            q: `name='${this.rootFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        if (response.data.files.length > 0) {
            this.rootFolderId = response.data.files[0].id;
        } else {
            // Criar pasta raiz
            const folderMetadata = {
                name: this.rootFolderName,
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            const folder = await this.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            
            this.rootFolderId = folder.data.id;
        }
        
        return this.rootFolderId;
    }
    
    // Listar itens de uma pasta
    async listFolder(folderPath = '') {
        await this.initRootFolder();
        
        let parentId = this.rootFolderId;
        
        // Navegar até a pasta desejada
        if (folderPath && folderPath !== 'Documentos/') {
            const parts = folderPath.replace('Documentos/', '').split('/').filter(Boolean);
            
            for (const part of parts) {
                const response = await this.drive.files.list({
                    q: `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'files(id)',
                    spaces: 'drive'
                });
                
                if (response.data.files.length === 0) {
                    return []; // Pasta não existe
                }
                
                parentId = response.data.files[0].id;
            }
        }
        
        // Listar conteúdo
        const response = await this.drive.files.list({
            q: `'${parentId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents)',
            spaces: 'drive',
            pageSize: 1000
        });
        
        return response.data.files || [];
    }
    
    // Criar pasta
    async createFolder(folderPath, folderName) {
        await this.initRootFolder();
        
        let parentId = this.rootFolderId;
        
        // Navegar até pasta pai
        if (folderPath && folderPath !== 'Documentos/') {
            const parts = folderPath.replace('Documentos/', '').split('/').filter(Boolean);
            
            for (const part of parts) {
                const response = await this.drive.files.list({
                    q: `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'files(id)'
                });
                
                if (response.data.files.length > 0) {
                    parentId = response.data.files[0].id;
                } else {
                    throw new Error('Pasta pai não encontrada');
                }
            }
        }
        
        // Criar pasta
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        
        const folder = await this.drive.files.create({
            resource: folderMetadata,
            fields: 'id, name, mimeType, createdTime, modifiedTime, webViewLink, parents'
        });
        
        return folder.data;
    }
    
    // Upload de arquivo
    async uploadFile(folderPath, fileName, buffer, mimetype) {
        await this.initRootFolder();
        
        let parentId = this.rootFolderId;
        
        // Navegar até pasta
        if (folderPath && folderPath !== 'Documentos/') {
            const parts = folderPath.replace('Documentos/', '').split('/').filter(Boolean);
            
            for (const part of parts) {
                const response = await this.drive.files.list({
                    q: `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'files(id)'
                });
                
                if (response.data.files.length > 0) {
                    parentId = response.data.files[0].id;
                }
            }
        }
        
        // Criar stream
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);
        
        // Upload
        const fileMetadata = {
            name: fileName,
            parents: [parentId]
        };
        
        const media = {
            mimeType: mimetype,
            body: bufferStream
        };
        
        const file = await this.drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents'
        });
        
        // Tornar público (para drag & drop)
        await this.drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
        
        return file.data;
    }
    
    // Download de arquivo
    async downloadFile(fileId) {
        const response = await this.drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        
        return response.data;
    }
    
    // Obter link de download
    async getDownloadUrl(fileId) {
        const response = await this.drive.files.get({
            fileId: fileId,
            fields: 'webContentLink'
        });
        
        return response.data.webContentLink;
    }
    
    // Deletar item
    async deleteItem(fileId) {
        await this.drive.files.delete({
            fileId: fileId
        });
    }
    
    // Renomear item
    async renameItem(fileId, newName) {
        const response = await this.drive.files.update({
            fileId: fileId,
            resource: {
                name: newName
            },
            fields: 'id, name, modifiedTime'
        });
        
        return response.data;
    }
    
    // Buscar arquivos
    async searchFiles(query) {
        await this.initRootFolder();
        
        const response = await this.drive.files.list({
            q: `name contains '${query}' and '${this.rootFolderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents)',
            spaces: 'drive',
            pageSize: 50
        });
        
        return response.data.files || [];
    }
    
    // Obter informações de um arquivo
    async getFile(fileId) {
        const response = await this.drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents'
        });
        
        return response.data;
    }
    
    // Obter estrutura completa (recursivo)
    async getFullStructure(parentId = null, folderPath = 'Documentos/', results = []) {
        if (!parentId) {
            await this.initRootFolder();
            parentId = this.rootFolderId;
        }
        
        const response = await this.drive.files.list({
            q: `'${parentId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents)',
            spaces: 'drive',
            pageSize: 1000
        });
        
        const files = response.data.files || [];
        
        for (const file of files) {
            const itemPath = folderPath + file.name + (file.mimeType === 'application/vnd.google-apps.folder' ? '/' : '');
            
            results.push({
                ...file,
                path: itemPath,
                folderPath: folderPath
            });
            
            // Se for pasta, buscar conteúdo
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                await this.getFullStructure(file.id, itemPath, results);
            }
        }
        
        return results;
    }
}

module.exports = GoogleDriveClient;
