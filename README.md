# realtime-editor.js
A realtime editor.js collaborative interface based on OT (instead of CRDTs). The goal for this repo is simplicity, so people can understand how easy collaborative realtime editing can be using OT (Operational Transforms).

![image](https://github.com/user-attachments/assets/e94da0ac-04df-4f64-80d6-72c5494c9813)

I didn't do much more than setup the basics using editor.js.

If you add editor.js blocks besides headings and text, it will just show that users cursor on that block.

I tested this with 10 clients and there were no issues. Collaborating with more than 10 people would probably melt your users brains before the server would go above 1% usage, so this scales just fine for any sort of document collaboration.

Operational Transforms (OT) are simpler and much faster than CRDTs, and take advantage of structures like JSON.

I implemented this with ShareDB which handles all complexities of OT.

Google Docs and most apps that don't need more than a few dozen collaborators seem to all select OT over CRDT.

# Install

```
npm i
```

# Build
```
npm run build
```

# Start
```
npm start
```
