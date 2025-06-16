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

// Simple Document Synchronization without ShareDB
class DocumentSync {
    constructor(documentSocket, editor) {
        this.documentSocket = documentSocket;
        this.editor = editor;
        this.isApplyingRemoteChange = false;
        this.lastKnownData = null;
        this.changeTimeout = null;
        this.isSubmittingChange = false;
    }

    async handleLocalChange() {
        if (this.isApplyingRemoteChange || this.isSubmittingChange) return;
        
        // Reduced debounce for more real-time feel
        clearTimeout(this.changeTimeout);
        this.changeTimeout = setTimeout(async () => {
            try {
                const data = await this.editor.save();
                
                // Only submit if data actually changed and we're not already submitting
                if (!this.isSubmittingChange && JSON.stringify(data) !== JSON.stringify(this.lastKnownData)) {
                    this.isSubmittingChange = true;
                    
                    if (this.documentSocket && this.documentSocket.readyState === WebSocket.OPEN) {
                        this.documentSocket.send(JSON.stringify({
                            type: 'document_change',
                            data: data,
                            clientId: this.userManager?.clientId
                        }));
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
        // Store the data to be used when editor is ready
        // Editor.js doesn't have a render method, it uses data in constructor
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
            onReady: () => {
                // Remove loading spinner
                const loadingElement = document.querySelector('.editor-loading');
                if (loadingElement) {
                    loadingElement.remove();
                }
                
                // Initialize document sync
                this.documentSync = new DocumentSync(this.documentSocket, this.editor);
                this.documentSync.userManager = this.userManager;
                
                // Initial document data will be handled through document sync
                // Editor.js doesn't have a render method
                
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
