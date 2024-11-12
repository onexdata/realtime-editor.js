import ReconnectingWebSocket from 'reconnecting-websocket';
import ShareDB from 'sharedb/lib/client';

// Connect to ShareDB
const shareDBSocket = new ReconnectingWebSocket('ws://' + window.location.host + '/sharedb');
const connection = new ShareDB.Connection(shareDBSocket);
const doc = connection.get('documents', 'example-doc');

// Separate WebSocket for cursor updates
const cursorSocket = new ReconnectingWebSocket('ws://' + window.location.host + '/cursors');

function createUserColorIndicator(color) {
    const indicator = document.createElement('div');
    indicator.className = 'user-color-indicator';
    indicator.style.position = 'absolute';
    indicator.style.top = '10px';
    indicator.style.right = '10px';
    indicator.style.padding = '4px 8px';
    indicator.style.borderRadius = '4px';
    indicator.style.backgroundColor = 'white';
    indicator.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    indicator.style.fontSize = '12px';
    indicator.style.display = 'flex';
    indicator.style.alignItems = 'center';
    indicator.style.gap = '6px';
    
    const text = document.createElement('span');
    text.textContent = 'Your cursor:';
    
    const colorSwatch = document.createElement('div');
    colorSwatch.style.width = '12px';
    colorSwatch.style.height = '12px';
    colorSwatch.style.backgroundColor = color;
    colorSwatch.style.borderRadius = '2px';
    
    indicator.appendChild(text);
    indicator.appendChild(colorSwatch);
    
    return indicator;
}

// Initialize Editor.js instance
let editor;
let clientId = Math.random().toString(36).substr(2, 9);
let cursors = new Map();
let clientColor = getRandomColor();

function createCursor(clientInfo) {
    const cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.style.position = 'absolute';
    cursor.style.pointerEvents = 'none';
    cursor.style.transition = 'all 0.1s ease';
    cursor.style.zIndex = 1000;
    
    const flag = document.createElement('div');
    flag.className = 'cursor-flag';
    flag.style.backgroundColor = clientInfo.color;
    flag.style.padding = '2px 6px';
    flag.style.borderRadius = '3px';
    flag.style.color = 'white';
    flag.style.fontSize = '12px';
    flag.textContent = clientInfo.name || 'Anonymous';
    
    const line = document.createElement('div');
    line.className = 'cursor-line';
    line.style.width = '2px';
    line.style.height = '24px'; // Increased height for better visibility
    line.style.backgroundColor = clientInfo.color;
    
    cursor.appendChild(flag);
    cursor.appendChild(line);
    
    document.getElementById('editorjs').appendChild(cursor);
    return cursor;
}

function findBlockElement(node) {
    while (node && !node.classList?.contains('ce-block')) {
        node = node.parentElement;
    }
    return node;
}

function updateCursorPosition(clientId, position) {
    const cursor = cursors.get(clientId);
    if (!cursor || !position) return;

    try {
        const editorElement = document.getElementById('editorjs');
        const blocks = editorElement.querySelectorAll('.ce-block');
        const block = blocks[position.blockIndex];
        
        if (!block) return;

        // Handle both regular blocks and list items
        const contentElement = block.querySelector('[contenteditable="true"]') || 
                             block.querySelector('.cdx-list__item');
        if (!contentElement) return;

        const editorRect = editorElement.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const contentRect = contentElement.getBoundingClientRect();
        
        // Base position at start of content
        let cursorLeft = contentRect.left - editorRect.left;
        let cursorTop = contentRect.top - editorRect.top;

        // Ensure minimum left position
        const minLeft = blockRect.left - editorRect.left;
        
        if (position.offset > 0 && contentElement.textContent.length > 0) {
            const range = document.createRange();
            let textNode = contentElement.firstChild;
            
            // For list items, we might need to traverse into the text node
            if (contentElement.classList.contains('cdx-list__item')) {
                // Find the actual text node within the list item
                const walker = document.createTreeWalker(
                    contentElement,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
                textNode = walker.firstChild();
            } else if (!textNode && contentElement.textContent) {
                textNode = document.createTextNode(contentElement.textContent);
                contentElement.appendChild(textNode);
            }
            
            if (textNode) {
                const offset = Math.min(position.offset, textNode.textContent.length);
                
                try {
                    range.setStart(textNode, offset);
                    range.setEnd(textNode, offset);
                    const rects = range.getClientRects();
                    
                    if (rects.length > 0) {
                        cursorLeft = rects[0].left - editorRect.left;
                    }
                } catch (e) {
                    console.warn('Could not set precise cursor position', e);
                }
            }
        }

        // Ensure cursor doesn't go beyond bounds
        cursorLeft = Math.max(cursorLeft, minLeft);
        
        cursor.style.left = `${cursorLeft}px`;
        cursor.style.top = `${cursorTop + 3}px`; // Keep the 3px vertical adjustment
        cursor.style.height = `${contentRect.height}px`;
        
        // Adjust the flag position
        const flag = cursor.querySelector('.cursor-flag');
        flag.style.top = '-24px';
        
        // Ensure the cursor line aligns with text
        const line = cursor.querySelector('.cursor-line');
        line.style.top = '0';
    } catch (err) {
        console.error('Error updating cursor position:', err);
    }
}

// Update the updateLocalCursor function as well

function updateLocalCursor() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    
    // Handle both regular blocks and list items
    const blockElement = findBlockElement(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    if (!blockElement) return;
    
    const editorElement = document.getElementById('editorjs');
    const blocks = Array.from(editorElement.querySelectorAll('.ce-block'));
    const blockIndex = blocks.indexOf(blockElement);
    
    if (blockIndex === -1) return;
    
    // Get the offset within the actual text node for list items
    let offset = range.startOffset;
    if (blockElement.querySelector('.cdx-list__item')) {
        const listItem = blockElement.querySelector('.cdx-list__item');
        const walker = document.createTreeWalker(
            listItem,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        const textNode = walker.firstChild();
        if (textNode) {
            offset = range.startContainer === textNode ? range.startOffset : 0;
        }
    }
    
    broadcastCursorPosition(blockIndex, offset);
}

function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastCursorPosition(blockIndex, offset) {
    if (cursorSocket.readyState === WebSocket.OPEN) {
        const message = {
            type: 'cursor',
            clientId: clientId,
            position: {
                blockIndex,
                offset
            },
            clientInfo: {
                name: 'User ' + clientId.substr(0, 4),
                color: clientColor
            }
        };
        
        cursorSocket.send(JSON.stringify(message));
    }
}

doc.subscribe(function(err) {
    if (err) throw err;

    editor = new EditorJS({
        holder: 'editorjs',
        onChange: async function() {
            const data = await editor.save();
            
            if (!isApplyingRemoteChange) {
                const op = { p: [], od: doc.data, oi: data };
                doc.submitOp(op, { source: true });
                
                // Update cursor position after changes
                setTimeout(updateLocalCursor, 0);
            }
        },
        onReady: () => {
            // Add the color indicator after editor is ready
            const container = document.getElementById('editorjs');
            const indicator = createUserColorIndicator(clientColor);
            container.appendChild(indicator);
            // Initial cursor position
            setTimeout(updateLocalCursor, 0);
        },
        data: doc.data,
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

    const editorElement = document.getElementById('editorjs');
    
    // Track various events that should update cursor
    editorElement.addEventListener('click', updateLocalCursor);
    editorElement.addEventListener('keyup', updateLocalCursor);
    editorElement.addEventListener('keydown', (e) => {
        // Update on Enter key to handle new blocks
        if (e.key === 'Enter') {
            setTimeout(updateLocalCursor, 50); // Slight delay to let Editor.js create the block
        }
    });
    
    document.addEventListener('selectionchange', () => {
        setTimeout(updateLocalCursor, 0);
    });
});

cursorSocket.addEventListener('message', function(event) {
    try {
        const message = JSON.parse(event.data);
        if (message.type === 'cursor' && message.clientId !== clientId) {
            let cursor = cursors.get(message.clientId);
            
            if (message.type === 'remove') {
                if (cursor) {
                    cursor.remove();
                    cursors.delete(message.clientId);
                }
                return;
            }
            
            if (!cursor) {
                cursor = createCursor(message.clientInfo);
                cursors.set(message.clientId, cursor);
            }
            
            updateCursorPosition(message.clientId, message.position);
        }
    } catch (err) {
        console.error('Error processing cursor message:', err);
    }
});

let isApplyingRemoteChange = false;

doc.on('op', function(op, source) {
    if (!source) {
        isApplyingRemoteChange = true;
        
        if (editor && editor.render) {
            editor.render(doc.data).then(() => {
                isApplyingRemoteChange = false;
                // Update cursor position after remote changes
                setTimeout(updateLocalCursor, 0);
            }).catch(err => {
                console.error('Error rendering editor:', err);
                isApplyingRemoteChange = false;
            });
        }
    }
});

window.addEventListener('beforeunload', () => {
    cursorSocket.send(JSON.stringify({
        type: 'cursor',
        clientId: clientId,
        type: 'remove'
    }));
});