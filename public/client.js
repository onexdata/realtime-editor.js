// User Management System
class UserManager {
    constructor() {
        this.clientId = this.getOrCreateClientId();
        this.userName = this.getOrCreateUserName();
        this.userColor = this.getOrCreateUserColor();
    }

    getOrCreateClientId() {
        let id = localStorage.getItem('collaborativeEditor_clientId');
        if (!id) {
            id = Math.random().toString(36).substr(2, 9);
            localStorage.setItem('collaborativeEditor_clientId', id);
        }
        return id;
    }

    getOrCreateUserName() {
        let name = localStorage.getItem('collaborativeEditor_userName');
        if (!name) {
            name = this.promptForUserName();
        }
        return name;
    }

    getOrCreateUserColor() {
        let color = localStorage.getItem('collaborativeEditor_userColor');
        if (!color) {
            color = this.getRandomColor();
            localStorage.setItem('collaborativeEditor_userColor', color);
        }
        return color;
    }

    promptForUserName() {
        let name = prompt('Enter your name for collaboration:');
        if (!name || name.trim() === '') {
            name = 'Anonymous User';
        }
        name = name.trim().substring(0, 20); // Limit length
        localStorage.setItem('collaborativeEditor_userName', name);
        return name;
    }

    getRandomColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#FF8A80', '#82B1FF', '#B39DDB', '#A5D6A7'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    updateUserName(newName) {
        this.userName = newName.trim().substring(0, 20);
        localStorage.setItem('collaborativeEditor_userName', this.userName);
    }
}

// Improved Cursor Management
class CursorManager {
    constructor(userManager, cursorSocket) {
        this.userManager = userManager;
        this.cursorSocket = cursorSocket;
        this.cursors = new Map();
        this.lastPosition = null;
        this.debounceTimer = null;
    }

    createCursor(clientInfo) {
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 1000;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
        `;
        
        const flag = document.createElement('div');
        flag.className = 'cursor-flag';
        flag.style.cssText = `
            position: absolute;
            top: -28px;
            left: -1px;
            background-color: ${clientInfo.color};
            padding: 4px 8px;
            border-radius: 4px;
            color: white;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transform: translateX(-50%);
        `;
        flag.textContent = clientInfo.name;
        
        const line = document.createElement('div');
        line.className = 'cursor-line';
        line.style.cssText = `
            width: 2px;
            height: 20px;
            background-color: ${clientInfo.color};
            border-radius: 1px;
            box-shadow: 0 0 3px rgba(0,0,0,0.3);
        `;
        
        cursor.appendChild(flag);
        cursor.appendChild(line);
        
        const editorElement = document.getElementById('editorjs');
        editorElement.appendChild(cursor);
        
        // Fade in animation
        requestAnimationFrame(() => {
            cursor.style.opacity = '1';
        });
        
        return cursor;
    }

    updateCursorPosition(clientId, position) {
        const cursor = this.cursors.get(clientId);
        if (!cursor || !position) return;

        try {
            const editorElement = document.getElementById('editorjs');
            const blocks = editorElement.querySelectorAll('.ce-block');
            const block = blocks[position.blockIndex];
            
            if (!block) {
                cursor.style.opacity = '0';
                return;
            }

            const contentElement = block.querySelector('[contenteditable="true"]');
            if (!contentElement) {
                // Fallback to block positioning for unsupported blocks
                const blockRect = block.getBoundingClientRect();
                const editorRect = editorElement.getBoundingClientRect();
                
                cursor.style.left = `${blockRect.left - editorRect.left + 10}px`;
                cursor.style.top = `${blockRect.top - editorRect.top + 10}px`;
                cursor.style.opacity = '1';
                return;
            }

            const editorRect = editorElement.getBoundingClientRect();
            const contentRect = contentElement.getBoundingClientRect();
            
            let cursorLeft = contentRect.left - editorRect.left;
            let cursorTop = contentRect.top - editorRect.top;

            // Calculate precise text position
            if (position.offset > 0 && contentElement.textContent.length > 0) {
                try {
                    const range = document.createRange();
                    const textNode = this.findTextNode(contentElement);
                    
                    if (textNode) {
                        const offset = Math.min(position.offset, textNode.textContent.length);
                        range.setStart(textNode, offset);
                        range.setEnd(textNode, offset);
                        
                        const rects = range.getClientRects();
                        if (rects.length > 0) {
                            cursorLeft = rects[0].left - editorRect.left;
                        }
                    }
                } catch (e) {
                    // Fallback to content start position
                }
            }

            cursor.style.left = `${cursorLeft}px`;
            cursor.style.top = `${cursorTop}px`;
            cursor.style.opacity = '1';
            
            // Update line height to match content
            const line = cursor.querySelector('.cursor-line');
            line.style.height = `${Math.min(contentRect.height, 24)}px`;
            
        } catch (err) {
            console.error('Error updating cursor position:', err);
        }
    }

    findTextNode(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        return walker.nextNode();
    }

    broadcastCursorPosition(blockIndex, offset) {
        // Debounce cursor updates to reduce network traffic
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            if (this.cursorSocket && this.cursorSocket.readyState === WebSocket.OPEN) {
                const position = { blockIndex, offset };
                
                // Only send if position actually changed
                if (!this.lastPosition || 
                    this.lastPosition.blockIndex !== blockIndex || 
                    this.lastPosition.offset !== offset) {
                    
                    const message = {
                        type: 'cursor',
                        clientId: this.userManager.clientId,
                        position,
                        clientInfo: {
                            name: this.userManager.userName,
                            color: this.userManager.userColor
                        }
                    };
                    
                    this.cursorSocket.send(JSON.stringify(message));
                    this.lastPosition = position;
                }
            }
        }, 50);
    }

    updateLocalCursor() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        
        const blockElement = this.findBlockElement(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
        if (!blockElement) return;
        
        const editorElement = document.getElementById('editorjs');
        const blocks = Array.from(editorElement.querySelectorAll('.ce-block'));
        const blockIndex = blocks.indexOf(blockElement);
        
        if (blockIndex === -1) return;
        
        let offset = range.startOffset;
        
        // Handle text offset calculation for different block types
        if (node.nodeType === Node.TEXT_NODE) {
            offset = range.startOffset;
        } else {
            offset = 0;
        }
        
        this.broadcastCursorPosition(blockIndex, offset);
    }

    findBlockElement(node) {
        while (node && !node.classList?.contains('ce-block')) {
            node = node.parentElement;
        }
        return node;
    }

    removeCursor(clientId) {
        const cursor = this.cursors.get(clientId);
        if (cursor) {
            cursor.style.opacity = '0';
            setTimeout(() => {
                cursor.remove();
                this.cursors.delete(clientId);
            }, 150);
        }
    }

    handleCursorMessage(message) {
        if (message.clientId === this.userManager.clientId) return;
        
        if (message.action === 'remove') {
            this.removeCursor(message.clientId);
            return;
        }
        
        let cursor = this.cursors.get(message.clientId);
        if (!cursor) {
            cursor = this.createCursor(message.clientInfo);
            this.cursors.set(message.clientId, cursor);
        } else {
            // Update cursor info if it changed
            const flag = cursor.querySelector('.cursor-flag');
            if (flag.textContent !== message.clientInfo.name) {
                flag.textContent = message.clientInfo.name;
            }
        }
        
        this.updateCursorPosition(message.clientId, message.position);
    }
}

// Improved Document Synchronization with Block-level Changes
class DocumentSync {
    constructor(documentSocket, editor) {
        this.documentSocket = documentSocket;
        this.editor = editor;
        this.isApplyingRemoteChange = false;
        this.lastKnownData = null;
        this.changeTimeout = null;
        this.isSubmittingChange = false;
        this.blockHashes = new Map(); // Track individual block hashes
    }

    // Generate a simple hash for a block to detect changes
    hashBlock(block) {
        return JSON.stringify({
            type: block.type,
            data: block.data
        });
    }

    // Find which blocks have changed
    findChangedBlocks(oldData, newData) {
        const changes = [];
        const oldBlocks = oldData?.blocks || [];
        const newBlocks = newData?.blocks || [];
        
        // Check for modified or new blocks
        newBlocks.forEach((newBlock, index) => {
            const oldBlock = oldBlocks[index];
            const newHash = this.hashBlock(newBlock);
            
            if (!oldBlock || this.hashBlock(oldBlock) !== newHash) {
                changes.push({
                    type: 'block_change',
                    index: index,
                    block: newBlock,
                    action: oldBlock ? 'update' : 'insert'
                });
            }
        });
        
        // Check for deleted blocks
        if (oldBlocks.length > newBlocks.length) {
            for (let i = newBlocks.length; i < oldBlocks.length; i++) {
                changes.push({
                    type: 'block_change',
                    index: i,
                    action: 'delete'
                });
            }
        }
        
        return changes;
    }

    async handleLocalChange() {
        if (this.isApplyingRemoteChange || this.isSubmittingChange) return;
        
        // Don't process changes until lastKnownData is properly initialized
        if (this.lastKnownData === null) {
            console.log('Skipping change - editor not fully initialized yet');
            return;
        }
        
        // Reduced debounce for more real-time feel
        clearTimeout(this.changeTimeout);
        this.changeTimeout = setTimeout(async () => {
            try {
                const data = await this.editor.save();
                
                // Only submit if data actually changed and we're not already submitting
                if (!this.isSubmittingChange && JSON.stringify(data) !== JSON.stringify(this.lastKnownData)) {
                    this.isSubmittingChange = true;
                    
                    if (this.documentSocket && this.documentSocket.readyState === WebSocket.OPEN) {
                        // Find specific block changes instead of sending entire document
                        const changes = this.findChangedBlocks(this.lastKnownData, data);
                        
                        if (changes.length > 0) {
                            // Send individual block changes
                            changes.forEach(change => {
                                this.documentSocket.send(JSON.stringify({
                                    type: 'block_change',
                                    change: change,
                                    timestamp: Date.now(),
                                    clientId: this.userManager?.clientId
                                }));
                            });
                            console.log('Sent', changes.length, 'block changes');
                        } else {
                            // Fallback: send full document if we can't determine changes
                            this.documentSocket.send(JSON.stringify({
                                type: 'document_change',
                                data: data,
                                clientId: this.userManager?.clientId
                            }));
                            console.log('Sent full document as fallback');
                        }
                    }
                    
                    this.lastKnownData = JSON.parse(JSON.stringify(data));
                    this.isSubmittingChange = false;
                }
            } catch (err) {
                this.isSubmittingChange = false;
                console.error('Error handling local change:', err);
            }
        }, 100); // 100ms for real-time feel
    }

    async handleRemoteChange(data) {
        if (this.isApplyingRemoteChange) return;
        
        this.isApplyingRemoteChange = true;
        
        try {
            // Store current selection
            const selection = window.getSelection();
            let savedBlockIndex = -1;
            let savedOffset = 0;
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const node = range.startContainer;
                const blockElement = this.findBlockElement(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
                
                if (blockElement) {
                    const editorElement = document.getElementById('editorjs');
                    const blocks = Array.from(editorElement.querySelectorAll('.ce-block'));
                    savedBlockIndex = blocks.indexOf(blockElement);
                    savedOffset = range.startOffset;
                }
            }
            
            // Editor.js doesn't have a render method
            // For now, we'll just store the data and let the user manually refresh
            // In a real implementation, you'd need to manually update blocks
            this.lastKnownData = JSON.parse(JSON.stringify(data));
            console.log('Remote document change received - refresh page to see changes');
            
            // Restore selection based on block index
            if (savedBlockIndex >= 0) {
                setTimeout(() => {
                    try {
                        const editorElement = document.getElementById('editorjs');
                        const blocks = editorElement.querySelectorAll('.ce-block');
                        const targetBlock = blocks[savedBlockIndex];
                        
                        if (targetBlock) {
                            const contentElement = targetBlock.querySelector('[contenteditable="true"]');
                            if (contentElement) {
                                const range = document.createRange();
                                const textNode = this.findTextNode(contentElement);
                                
                                if (textNode) {
                                    const offset = Math.min(savedOffset, textNode.textContent.length);
                                    range.setStart(textNode, offset);
                                    range.setEnd(textNode, offset);
                                    
                                    const selection = window.getSelection();
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                }
                            }
                        }
                    } catch (e) {
                        // Selection restoration failed, ignore
                    }
                }, 0);
            }
            
        } catch (err) {
            console.error('Error applying remote change:', err);
        } finally {
            this.isApplyingRemoteChange = false;
        }
    }

    async handleRemoteBlockChange(change) {
        if (this.isApplyingRemoteChange) return;
        
        this.isApplyingRemoteChange = true;
        
        try {
            console.log('Remote block change received:', change.action, 'at index', change.index);
            
            // Update our local document data to stay in sync
            if (!this.lastKnownData) {
                this.lastKnownData = { blocks: [] };
            }
            
            if (!this.lastKnownData.blocks) {
                this.lastKnownData.blocks = [];
            }
            
            // Apply the change to our local data
            switch (change.action) {
                case 'insert':
                    this.lastKnownData.blocks.splice(change.index, 0, change.block);
                    break;
                    
                case 'update':
                    if (change.index < this.lastKnownData.blocks.length) {
                        this.lastKnownData.blocks[change.index] = change.block;
                    }
                    break;
                    
                case 'delete':
                    if (change.index < this.lastKnownData.blocks.length) {
                        this.lastKnownData.blocks.splice(change.index, 1);
                    }
                    break;
            }
            
            // Apply the change to the actual editor
            await this.applyBlockChangeToEditor(change);
            
            console.log('Block change applied. Current blocks:', this.lastKnownData.blocks.length);
            
        } catch (err) {
            console.error('Error applying remote block change:', err);
        } finally {
            this.isApplyingRemoteChange = false;
        }
    }

    async applyBlockChangeToEditor(change) {
        if (!this.editor || !this.editor.isReady) return;
        
        try {
            // Store current selection to restore later
            const selection = window.getSelection();
            let savedBlockIndex = -1;
            let savedOffset = 0;
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const node = range.startContainer;
                const blockElement = this.findBlockElement(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
                
                if (blockElement) {
                    const editorElement = document.getElementById('editorjs');
                    const blocks = Array.from(editorElement.querySelectorAll('.ce-block'));
                    savedBlockIndex = blocks.indexOf(blockElement);
                    savedOffset = range.startOffset;
                }
            }
            
            // Try to apply individual block changes using Editor.js API when possible
            try {
                switch (change.action) {
                    case 'insert':
                        // Use Editor.js blocks API to insert block
                        await this.editor.blocks.insert(change.block.type, change.block.data, {}, change.index);
                        console.log('Block inserted at index', change.index);
                        break;
                        
                    case 'update':
                        // Use Editor.js blocks API to update block
                        if (change.index < await this.editor.blocks.getBlocksCount()) {
                            const blockToUpdate = await this.editor.blocks.getBlockByIndex(change.index);
                            if (blockToUpdate) {
                                await this.editor.blocks.update(blockToUpdate.id, change.block.data);
                                console.log('Block updated at index', change.index);
                            }
                        }
                        break;
                        
                    case 'delete':
                        // Use Editor.js blocks API to delete block
                        if (change.index < await this.editor.blocks.getBlocksCount()) {
                            const blockToDelete = await this.editor.blocks.getBlockByIndex(change.index);
                            if (blockToDelete) {
                                await this.editor.blocks.delete(blockToDelete.id);
                                console.log('Block deleted at index', change.index);
                            }
                        }
                        break;
                }
                
                // Restore selection if possible
                if (savedBlockIndex >= 0) {
                    setTimeout(() => {
                        try {
                            const editorElement = document.getElementById('editorjs');
                            const blocks = editorElement.querySelectorAll('.ce-block');
                            
                            // Adjust block index if blocks were inserted/deleted before current position
                            let targetIndex = savedBlockIndex;
                            if (change.action === 'insert' && change.index <= savedBlockIndex) {
                                targetIndex++;
                            } else if (change.action === 'delete' && change.index < savedBlockIndex) {
                                targetIndex--;
                            }
                            
                            const targetBlock = blocks[Math.max(0, Math.min(targetIndex, blocks.length - 1))];
                            
                            if (targetBlock) {
                                const contentElement = targetBlock.querySelector('[contenteditable="true"]');
                                if (contentElement) {
                                    const range = document.createRange();
                                    const textNode = this.findTextNode(contentElement);
                                    
                                    if (textNode) {
                                        const offset = Math.min(savedOffset, textNode.textContent.length);
                                        range.setStart(textNode, offset);
                                        range.setEnd(textNode, offset);
                                        
                                        const selection = window.getSelection();
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                    }
                                }
                            }
                        } catch (e) {
                            // Selection restoration failed, ignore
                        }
                    }, 100);
                }
                
            } catch (apiError) {
                console.log('Editor.js API method failed:', apiError.message);
                // For now, just log the error. In a production system, you might want to
                // implement a more sophisticated fallback or conflict resolution strategy
            }
            
        } catch (err) {
            console.error('Error applying block change to editor:', err);
        }
    }

    findBlockElement(node) {
        while (node && !node.classList?.contains('ce-block')) {
            node = node.parentElement;
        }
        return node;
    }

    findTextNode(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        return walker.nextNode();
    }
}

// User Interface Components
function createUserIndicator(userManager) {
    const indicator = document.createElement('div');
    indicator.className = 'user-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1001;
        border: 1px solid #e0e0e0;
    `;
    
    const colorSwatch = document.createElement('div');
    colorSwatch.style.cssText = `
        width: 16px;
        height: 16px;
        background-color: ${userManager.userColor};
        border-radius: 3px;
        border: 1px solid rgba(0,0,0,0.1);
    `;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = userManager.userName;
    nameSpan.style.fontWeight = '500';
    
    const editButton = document.createElement('button');
    editButton.textContent = '✏️';
    editButton.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        border-radius: 2px;
        opacity: 0.7;
    `;
    editButton.title = 'Change your name';
    
    editButton.addEventListener('click', () => {
        const newName = prompt('Enter your new name:', userManager.userName);
        if (newName && newName.trim() !== '') {
            userManager.updateUserName(newName);
            nameSpan.textContent = userManager.userName;
        }
    });
    
    indicator.appendChild(colorSwatch);
    indicator.appendChild(nameSpan);
    indicator.appendChild(editButton);
    
    return indicator;
}

function createConnectionStatus() {
    const status = document.createElement('div');
    status.className = 'connection-status connecting';
    status.textContent = 'Connecting...';
    document.body.appendChild(status);
    return status;
}

function updateConnectionStatus(status, state, message) {
    status.className = `connection-status ${state}`;
    status.textContent = message;
    
    // Auto-hide connected status after 3 seconds
    if (state === 'connected') {
        setTimeout(() => {
            status.style.opacity = '0';
            setTimeout(() => {
                if (status.className.includes('connected')) {
                    status.style.display = 'none';
                }
            }, 300);
        }, 3000);
    } else {
        status.style.opacity = '1';
        status.style.display = 'block';
    }
}

// Main Application
class CollaborativeEditor {
    constructor() {
        this.userManager = new UserManager();
        this.connectionStatus = createConnectionStatus();
        this.setupConnections();
        this.initializeEditor();
    }

    setupConnections() {
        // Document synchronization connection
        this.documentSocket = new WebSocket('ws://' + window.location.host + '/document');
        
        // Cursor connection
        this.cursorSocket = new WebSocket('ws://' + window.location.host + '/cursors');
        this.cursorManager = new CursorManager(this.userManager, this.cursorSocket);

        // Document socket events
        this.documentSocket.addEventListener('open', () => {
            updateConnectionStatus(this.connectionStatus, 'connected', 'Connected to server');
            // Request initial document
            this.documentSocket.send(JSON.stringify({
                type: 'get_document'
            }));
        });

        this.documentSocket.addEventListener('close', () => {
            updateConnectionStatus(this.connectionStatus, 'disconnected', 'Disconnected from server');
        });

        this.documentSocket.addEventListener('error', () => {
            updateConnectionStatus(this.connectionStatus, 'disconnected', 'Connection error');
        });

        this.documentSocket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'document_data') {
                    this.handleInitialDocument(message.data);
                } else if (message.type === 'document_change' && message.clientId !== this.userManager.clientId) {
                    this.documentSync.handleRemoteChange(message.data);
                } else if (message.type === 'block_change' && message.clientId !== this.userManager.clientId) {
                    this.documentSync.handleRemoteBlockChange(message.change);
                }
            } catch (err) {
                console.error('Error processing document message:', err);
            }
        });

        // Cursor socket events
        this.cursorSocket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'cursor') {
                    this.cursorManager.handleCursorMessage(message);
                }
            } catch (err) {
                console.error('Error processing cursor message:', err);
            }
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.cursorSocket.readyState === WebSocket.OPEN) {
                this.cursorSocket.send(JSON.stringify({
                    type: 'cursor',
                    clientId: this.userManager.clientId,
                    action: 'remove'
                }));
            }
        });
    }

    async handleInitialDocument(data) {
        this.initialDocumentData = data;
        
        // If editor is already ready, we need to recreate it with the new data
        if (this.editor && this.editor.isReady) {
            await this.recreateEditorWithData(data);
        }
        // Otherwise, the data will be used when editor becomes ready
    }

    async recreateEditorWithData(data) {
        if (!data) return;
        
        try {
            // Destroy the current editor
            if (this.editor && this.editor.destroy) {
                await this.editor.destroy();
            }
            
            // Clear the editor container
            const editorElement = document.getElementById('editorjs');
            editorElement.innerHTML = '';
            
            // Create new editor with the data
            this.editor = new EditorJS({
                holder: 'editorjs',
                data: data,
                onChange: () => {
                    if (this.documentSync) {
                        this.documentSync.handleLocalChange();
                    }
                    // Update cursor position after local changes
                    setTimeout(() => this.cursorManager.updateLocalCursor(), 0);
                },
                onReady: () => {
                    // Update document sync reference to new editor
                    if (this.documentSync) {
                        this.documentSync.editor = this.editor;
                        // Initialize the lastKnownData with the loaded data
                        this.documentSync.lastKnownData = JSON.parse(JSON.stringify(data));
                        console.log('Document sync updated with', data.blocks?.length || 0, 'blocks');
                    }
                    
                    this.setupEventListeners();
                    
                    // Initial cursor position
                    setTimeout(() => this.cursorManager.updateLocalCursor(), 100);
                    
                    console.log('Document loaded with', data.blocks?.length || 0, 'blocks');
                },
                tools: {
                    header: {
                        class: Header,
                        config: {
                            levels: [2, 3, 4],
                            defaultLevel: 2
                        }
                    },
                    list: {
                        class: List,
                        inlineToolbar: true
                    },
                    paragraph: {
                        class: Paragraph,
                        inlineToolbar: true
                    }
                }
            });
            
        } catch (err) {
            console.error('Error recreating editor with data:', err);
        }
    }

    initializeEditor() {
        this.editor = new EditorJS({
            holder: 'editorjs',
            onChange: () => {
                if (this.documentSync) {
                    this.documentSync.handleLocalChange();
                }
                // Update cursor position after local changes
                setTimeout(() => this.cursorManager.updateLocalCursor(), 0);
            },
            onReady: async () => {
                // Remove loading spinner
                const loadingElement = document.querySelector('.editor-loading');
                if (loadingElement) {
                    loadingElement.remove();
                }
                
                // Initialize document sync
                this.documentSync = new DocumentSync(this.documentSocket, this.editor);
                this.documentSync.userManager = this.userManager;
                
                // If we have initial document data, recreate editor with it
                if (this.initialDocumentData) {
                    await this.recreateEditorWithData(this.initialDocumentData);
                }
                
                this.setupEventListeners();
                this.addUserInterface();
                // Initial cursor position
                setTimeout(() => this.cursorManager.updateLocalCursor(), 100);
            },
            data: {
                time: Date.now(),
                blocks: [],
                version: "2.28.2"
            },
            tools: {
                header: {
                    class: Header,
                    config: {
                        levels: [2, 3, 4],
                        defaultLevel: 2
                    }
                },
                list: {
                    class: List,
                    inlineToolbar: true
                },
                paragraph: {
                    class: Paragraph,
                    inlineToolbar: true
                }
            }
        });
    }

    setupEventListeners() {
        const editorElement = document.getElementById('editorjs');
        
        // Cursor tracking events
        editorElement.addEventListener('click', () => {
            setTimeout(() => this.cursorManager.updateLocalCursor(), 0);
        });
        
        editorElement.addEventListener('keyup', () => {
            this.cursorManager.updateLocalCursor();
        });
        
        editorElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(() => this.cursorManager.updateLocalCursor(), 50);
            }
        });
        
        // Global selection change tracking
        document.addEventListener('selectionchange', () => {
            if (document.activeElement && editorElement.contains(document.activeElement)) {
                this.cursorManager.updateLocalCursor();
            }
        });
    }

    addUserInterface() {
        const userIndicator = createUserIndicator(this.userManager);
        document.body.appendChild(userIndicator);
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeEditor();
});
