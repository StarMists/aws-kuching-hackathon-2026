import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { lexicalCandidateSql } from '../lib/retrieval/sql.ts';

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE documents(id TEXT,title TEXT,filename TEXT,owner_id TEXT); CREATE TABLE chunks(id TEXT,document_id TEXT,text TEXT);');
  const insertDocument = database.prepare('INSERT INTO documents VALUES (?,?,?,?)');
  const insertChunk = database.prepare('INSERT INTO chunks VALUES (?,?,?)');
  insertDocument.run('a', 'Procurement Standard', 'policy-a.txt', 'owner-a');
  insertDocument.run('b', 'Kitchen Manual', 'kitchen.txt', 'owner-a');
  insertDocument.run('foreign', 'Foreign Procurement Standard', 'foreign.txt', 'owner-b');
  insertChunk.run('a-c', 'a', 'Approval threshold is 90%_rate. Path C:\\test is literal.');
  insertChunk.run('b-c', 'b', 'Kitchen approval rate is 9000rate.');
  insertChunk.run('foreign-c', 'foreign', 'Procurement approval foreign material.');
  return database;
}

test('actual SQLite candidate query uses title and body while preserving owner predicate', () => {
  const database = fixture();
  try {
    const candidate = lexicalCandidateSql(['procurement']);
    const rows = database.prepare(`SELECT c.id FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.owner_id=? AND ${candidate.predicate}`).all('owner-a', ...candidate.values);
    assert.deepEqual(rows.map(row => row.id), ['a-c']);
  } finally { database.close(); }
});

test('LIKE wildcards and SQL-looking query text are literal parameter data', () => {
  const database = fixture();
  try {
    const query = term => { const candidate = lexicalCandidateSql([term]); return database.prepare(`SELECT c.id FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.owner_id=? AND ${candidate.predicate}`).all('owner-a', ...candidate.values).map(row => row.id); };
    assert.deepEqual(query('90%_rate'), ['a-c']);
    assert.deepEqual(query('c:\\test'), ['a-c']);
    assert.deepEqual(query("' OR 1=1 --"), []);
    assert.equal(database.prepare('SELECT count(*) AS count FROM documents').get().count, 3);
  } finally { database.close(); }
});

test('candidate term count stays under bounded D1 parameters and json selections work', () => {
  const candidate = lexicalCandidateSql(Array.from({ length: 150 }, (_, index) => `word-${index}`));
  assert.equal(candidate.values.length, 80);
  const database = fixture();
  try {
    const ids = Array.from({ length: 100 }, (_, index) => index === 0 ? 'a' : `absent-${index}`);
    const rows = database.prepare('SELECT id FROM documents WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))').all('owner-a', JSON.stringify(ids));
    assert.deepEqual(rows.map(row => row.id), ['a']);
  } finally { database.close(); }
});
