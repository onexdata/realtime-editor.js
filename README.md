# realtime-editor.js
A realtime editor.js collaborative interface based on OT (instead of CRDTs). The goal for this repo is simplicity, so people can understand how easy collaborative realtime editing can be using OT (Operational Transforms).

![image](https://github.com/user-attachments/assets/e94da0ac-04df-4f64-80d6-72c5494c9813)

# What does this do?
It creates a page that saves a document on a server in editor.js format. If you visit that page (http://localhost:3000), you will be able to edit that document.
If someone else visits that page, they will be able to edit it with you, and you'll see each others cursors.

There is no limit to the number of collaborators.

Basically, you could cut and paste this solution into your project if you use Editor.js. If it encounters a block type that isn't easy to show a cursor on, it will show a cursor on the top left of the block, but not where within the block.

The code is pretty small. You could use any LLM to paste this code and have it alter it for you with pretty great results.

# Install

```
npm i
```

# Start
```
npm start
```

That's it! No build step required - just refresh your browser to see changes.

## ShareDB
This uses [ShareDb](https://github.com/share/sharedb) for Operational Transforms. You could use ShareDB for anything that is JSON based.

## Storage
Although you could write documents to a database or files, for simplicity, I only wrote things to memory, so if you wipe the server you wipe your document. Hopefully this is obvious.

## Background
Realtime collaboration can be done in 3 ways:

1. Pasting messages back and forth, really fast, so people don't have time to create conflicts, and pray the conflicts that happen are ok.
2. Using CRDTs (Conflict-free Replicated Data Types) to resolve conflicts. This is slow (up to 600 times slower than JSON) and complex.
3. Using OT (Operational Transforms) to resolve conflicts. OT is simpler than CRDT and generally much faster. It also makes a lot more sense to implement OT when using JSON documents instead of text. CRDT becomes much slower when using JSON for example.

### Is CRDT better than OT?
No. It's different. You couldn't say a nailgun is better than a hammer if all you want to do is nail in a single nail or remove a nail; a nailgun requires a lot more bulk, expense, and actually can't pry out nails. Just like this, OT is actually better than CRDT with many use cases.

Some people believe OT isn't as good as CRDT, but generally the opposite is true if you're going for realtime, because CRDT is very slow.  Because of this, most apps opt for OT over CRDT (Both Google and Microsoft collaboration uses OT - Are you better than Google and Microsoft bruh?).

I didn't do much more than setup the basics using editor.js. This is to show you how things work so you can understand it.

If you add editor.js blocks besides headings and text, it will just show that users cursor on that block.

I tested this with 10 clients and there were no issues. Collaborating with more than 10 people would probably melt your users brains before the server would go above 1% usage, so this scales just fine for any sort of document collaboration.

Operational Transforms (OT) are simpler and much faster than CRDTs, and take advantage of structures like JSON.

I implemented this with ShareDB which handles all complexities of OT.

Google Docs and most apps that don't need more than a few dozen collaborators seem to all select OT over CRDT.
