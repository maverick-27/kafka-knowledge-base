// Activities for module 06, Transactions and exactly-once.
window.KB_EXTRAS = {
  module: '06',
  sections: {
    summary: [
      {
        id: 'ex-stock', type: 'example', title: 'The stock counter that drifted',
        story: `<p>A warehouse service reads <code>stock-movements</code> (each record: item, plus or minus a quantity) and writes the new total for each item to <code>stock-levels</code>. After a few weeks, totals in the topic no longer matched a physical count. The differences appeared after each crash of the service.</p>`,
        steps: [
          `<b>The steps of the service.</b> Read a batch of movements. Add them to totals. Write the new totals. Commit the input offsets.`,
          `<b>The crash window.</b> A crash after the totals were written but before the offsets were committed.`,
          `<b>After the restart.</b> The same movements are read again, added again, and written again. "Minus 3" was applied twice.`,
          `<b>Why idempotence did not help.</b> The producer's retries were fine. The duplicate came from processing the input twice, which idempotence does not cover.`,
          `<b>The fix.</b> One transaction for each batch: the new totals and the input offsets are written under the same commit marker.`,
          `<b>The crash window now.</b> A crash before the commit aborts both the totals and the offsets. The batch is read again and applied once.`,
          `<b>The other half.</b> Every reader of <code>stock-levels</code> was changed to <code>read_committed</code>, so that none of them sees totals from an aborted attempt.`,
        ],
        takeaway: `When output depends on adding up input, at-least-once gives wrong numbers, not just repeated ones. That is the case transactions were built for.`,
      },
      {
        id: 'q-scope', type: 'quiz', title: 'What is covered?',
        q: 'A service, inside one Kafka transaction, writes a record to a topic and inserts a row in PostgreSQL. The transaction aborts. What is the state?',
        options: ['Both are rolled back.', 'The Kafka record is hidden from committed readers; the database row stays.', 'Neither is rolled back.', 'The database row is rolled back; the record stays.'],
        answer: 1,
        why: 'A Kafka transaction covers Kafka only. The database knows nothing about it.',
      },
    ],

    model: [
      {
        id: 'flow-commit', type: 'flow', title: 'One transaction, from begin to committed',
        nodes: ['Producer', 'Transaction coordinator', 'Output partition', 'Offsets partition'],
        steps: [
          { from: 0, to: 1, label: 'init pay-1', say: '<code>initTransactions()</code>. The coordinator registers the transactional id and raises the epoch, which locks out any older instance.' },
          { from: 0, to: 2, label: 'A, B', store: [2], chip: 'A B (open)', say: 'The producer writes records A and B. They are in the log at once, flagged as transactional. Committed readers stop in front of them.' },
          { from: 0, to: 3, label: 'offset 3', store: [3], chip: 'offset 3 (open)', say: '<code>sendOffsetsToTransaction()</code>. The input position, 3, is written to the offsets partition. It does not count yet.' },
          { from: 0, to: 1, label: 'commit', say: '<code>commitTransaction()</code>. The producer asks the coordinator to commit.' },
          { at: 1, store: [1], chip: 'prepare commit', say: 'The coordinator writes "prepare commit" to its own log. <b>The outcome is now decided</b>, whatever fails next.' },
          { from: 1, to: 2, label: 'COMMIT', store: [2], chip: 'C', say: 'It sends a commit marker to the output partition. Committed readers can now read A and B.' },
          { from: 1, to: 3, label: 'COMMIT', store: [3], chip: 'C', say: 'And a commit marker to the offsets partition. The group\'s position is now 3.' },
          { at: 1, store: [1], chip: 'complete', say: 'The coordinator writes "complete commit".' },
          { from: 1, to: 0, label: 'ok', say: 'The producer is told. Output and input position changed together.' },
        ],
      },
      {
        id: 'm-tx', type: 'match', title: 'Transaction vocabulary',
        pairs: [
          ['transactional.id', 'A stable name that identifies a producer across restarts'],
          ['Marker', 'A control record that says commit or abort'],
          ['Last stable offset', 'Where committed readers must stop'],
          ['read_committed', 'Hides records of open and aborted transactions'],
          ['Fencing', 'Refusing an older instance with the same transactional id'],
          ['Transaction coordinator', 'The broker that tracks each transaction\'s state'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-commit', type: 'order', title: 'The commit, in order',
        q: 'Click the steps in the order they happen after <code>commitTransaction()</code>.',
        items: ['The producer asks the coordinator to commit.', 'The coordinator writes "prepare commit" to its log.', 'The coordinator writes a commit marker to each partition.', 'The coordinator writes "complete commit".', 'Committed readers move past the transaction\'s records.'],
        why: 'The second step is the point of no return. If the coordinator crashes after it, its replacement finishes the commit.',
      },
      {
        id: 'flow-zombie', type: 'flow', title: 'Two instances, one transactional id',
        nodes: ['Old instance', 'Transaction coordinator', 'New instance', 'Partition'],
        steps: [
          { from: 0, to: 3, label: 'A', store: [3], chip: 'A (open)', rename: [[0, 'Old instance (epoch 4)']], say: 'An instance with the id <code>pay-1</code> and epoch 4 writes A in a transaction. Then it freezes: a long pause.' },
          { at: 2, say: 'The platform thinks the old instance is dead and starts a replacement with the same id.' },
          { from: 2, to: 1, label: 'init pay-1', say: 'The new instance calls <code>initTransactions()</code>.' },
          { from: 1, to: 3, label: 'ABORT', clear: [3], store: [3], chip: 'A (aborted)', say: 'The coordinator aborts the transaction the old instance left open…' },
          { from: 1, to: 2, label: 'epoch 5', rename: [[2, 'New instance (epoch 5)']], say: '…and gives the new instance epoch 5.' },
          { from: 2, to: 3, label: 'A′', store: [3], chip: 'A′ (open)', say: 'The new instance processes the same input and writes its own result.' },
          { at: 0, say: 'The old instance wakes up. It still believes it is in the middle of its transaction.' },
          { from: 0, to: 3, label: 'B, epoch 4', fail: true, say: 'It tries to write with epoch 4. The partition refuses: the current epoch is 5. The old instance gets a "fenced" error and must stop.' },
          { from: 2, to: 1, label: 'commit', say: 'The new instance commits. Only its result counts. Without fencing, both instances would have written.' },
        ],
      },
      {
        id: 'q-lso', type: 'quiz', title: 'Where does the reader stop?',
        q: 'A partition has offsets 0 to 19. Offsets 0 to 9 are committed. A transaction that is still open wrote offsets 10 and 11. Another producer, without transactions, wrote 12 to 19. How far can a <code>read_committed</code> consumer read?',
        options: ['Up to offset 9', 'Up to offset 19, skipping 10 and 11', 'Up to offset 11', 'Nothing'],
        answer: 0,
        why: 'The last stable offset is 10, the first record of the open transaction. The reader cannot skip ahead, because order must be kept. One open transaction delays everything behind it.',
      },
    ],

    configs: [
      {
        id: 't-tx', type: 'tune', title: 'Settings for a transactional processor',
        goal: 'One batch takes up to <b>20 seconds</b> to process. If an instance crashes, readers must be blocked for <b>at most 1 minute</b>. Readers must <b>never see aborted results</b>. A restarted instance must <b>clean up after its predecessor at once</b>.',
        knobs: [
          { id: 'timeout', label: 'transaction.timeout.ms', options: [['10 seconds', 10], ['45 seconds', 45], ['15 minutes', 900]], start: 2 },
          { id: 'iso', label: 'Readers\' isolation.level', options: [['read_uncommitted (default)', 'ru'], ['read_committed', 'rc']], start: 0 },
          { id: 'tid', label: 'transactional.id', options: [['a random value at each start', 'random'], ['the same for each instance, every start', 'stable']], start: 0 },
        ],
        run: (v) => {
          const okBatch = v.timeout > 20, okBlock = v.timeout <= 60, okIso = v.iso === 'rc', okId = v.tid === 'stable';
          let html = 'Timeout ' + v.timeout + ' s. Batch fits: <b>' + (okBatch ? 'yes' : 'no') + '</b>. Blocked at most 1 minute after a crash: <b>' + (okBlock ? 'yes' : 'no') + '</b>. Readers protected: <b>' + (okIso ? 'yes' : 'no') + '</b>. Immediate clean-up: <b>' + (okId ? 'yes' : 'no') + '</b>.';
          if (!okBatch) html += '\nThe coordinator aborts the transaction while the batch is still being processed. The batch is retried and times out again, for ever.';
          if (!okBlock) html += '\nA crashed instance leaves its transaction open for up to ' + v.timeout / 60 + ' minutes, and every committed reader of those partitions waits.';
          if (!okIso) html += '\nWith the default isolation level, readers receive records from aborted attempts. The producer\'s transactions protect nobody.';
          if (!okId) html += '\nA new random id is a new producer to the coordinator. It does not abort the old instance\'s transaction; that waits for the timeout.';
          return { ok: okBatch && okBlock && okIso && okId, html };
        },
      },
      {
        id: 'c-markers', type: 'calc', title: 'Count the offsets',
        q: 'A producer writes 1,000 records to one empty partition, in transactions of 50 records each, and commits them all. What is the partition\'s end offset?',
        unit: '', answer: 1020, tol: 0,
        hint: 'How many transactions? What does each commit add?',
        working: '1,000 ÷ 50 = 20 transactions. Each commit writes one marker, and a marker uses one offset. 1,000 + 20 = 1,020. The lab showed the same: 30 records in 3 transactions gave an end offset of 33.',
      },
    ],

    failures: [
      {
        id: 's-stuck', type: 'scenario', title: 'A committed reader is stuck and the topic is growing',
        intro: 'The team that owns the <code>settlement</code> consumer reports that it has received nothing for 12 minutes. The topic\'s end offset is rising normally. A test consumer with default settings reads new records without trouble.',
        steps: [
          { situation: 'A default consumer reads; a <code>read_committed</code> consumer does not. What does that tell you?',
            choices: [
              { label: 'An open transaction is holding the last stable offset. Find it with the transactions tool.', good: true, result: '<code>kafka-transactions.sh list</code> shows the id <code>enricher-7</code> in state <code>Ongoing</code>. Describe shows it started 12 minutes ago, with a timeout of 15 minutes.' },
              { label: 'The consumer is broken. Restart it.', good: false, result: 'It rejoins and waits at the same offset.' },
              { label: 'Change the consumer to <code>read_uncommitted</code> so that it moves.', good: false, result: 'It moves, and it now settles payments from transactions that may be aborted.' },
            ] },
          { situation: 'The producer <code>enricher-7</code> is alive. Its logs show it began a transaction and is waiting for a slow call to another service inside it. What is the right view?',
            choices: [
              { label: 'The producer holds a transaction open across a slow outside call. That is a design fault in the producer.', good: true, result: 'Right. Every committed reader of those partitions waits for that outside call.' },
              { label: 'The broker is slow.', good: false, result: 'Broker metrics are normal. The time is being spent inside the producer\'s transaction.' },
            ] },
          { situation: 'Settlement is blocked now. What do you do in the short term?',
            choices: [
              { label: 'Restart <code>enricher-7</code>. Its new start calls <code>initTransactions()</code>, which aborts the open transaction at once.', good: true, result: 'The last stable offset jumps forward and the settlement consumer drains its backlog in two minutes. The aborted batch is processed again by the enricher.' },
              { label: 'Wait for the 15-minute timeout.', good: false, result: 'Settlement stays blocked for three more minutes. Then the coordinator aborts the transaction, the enricher retries the batch, makes the same slow call, and blocks everyone again.' },
              { label: 'Delete the <code>__transaction_state</code> topic.', good: false, result: 'Every transactional producer on the cluster loses its state. This is a cluster-wide outage.' },
            ] },
          { situation: 'What do you ask the enricher team to change?',
            choices: [
              { label: 'Do the slow call before the transaction begins; keep transactions short; lower <code>transaction.timeout.ms</code> to about a minute.', good: true, result: 'A transaction now lasts milliseconds. The worst case for readers after a crash is one minute.' },
              { label: 'Raise the transaction timeout so that it never aborts.', good: false, result: 'Next time, readers are blocked for longer.' },
            ] },
        ],
        debrief: 'A transaction is a lock on every committed reader of its partitions. Keep it short, never hold it across outside calls, and set the timeout as the longest block you accept.',
      },
    ],

    lab: [
      {
        id: 'lab-06', type: 'lab', title: 'Four more experiments',
        intro: '<p>These use the performance tool\'s transaction options, as in the main lab.</p>',
        tasks: [
          { task: 'Measure the cost of small transactions. Send 20,000 records with <code>--transaction-duration-ms 10</code> and again with <code>1000</code>, and compare the throughput.',
            hint: 'Very short transactions spend most of their time on commits. The longer setting should be clearly faster.' },
          { task: 'Count markers. After each run above, compare the number of records sent with the growth of the end offset.',
            hint: 'The difference is the number of commits. Many more for the 10-millisecond run.' },
          { task: 'Watch fencing. Start a long transactional run with the id <code>dup-1</code> in the background, then start a second run with the same id.',
            hint: 'The first run stops with a fenced or invalid-epoch error when the second one initialises. Describe the id to see the epoch rise.' },
          { task: 'See the reader lag behind an open transaction. Repeat step 4 of the lab, and while the transaction is open describe a <code>read_committed</code> consumer group\'s lag.',
            hint: 'The group\'s lag grows while the transaction is open and drops to zero when the coordinator aborts it.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-06', type: 'tf', title: 'Six statements about transactions',
        items: [
          { s: 'Records of an open transaction are kept outside the partition until the commit.', fact: false, why: 'They are appended to the partition at once. Markers and the reader\'s isolation level decide what is shown.' },
          { s: 'A consumer with default settings receives records from aborted transactions.', fact: true, why: 'The default is <code>read_uncommitted</code>. The lab showed 68 records against 30.' },
          { s: 'Exactly-once means the processing code runs only once for each record.', fact: false, why: 'The code can run several times. The committed result in Kafka happens once.' },
          { s: 'An aborted record still uses an offset.', fact: true, why: 'It stays in the log until retention removes it. Committed readers skip it.' },
          { s: 'A transaction can include writes to two different topics.', fact: true, why: 'Any partitions in the same cluster, and offset commits.' },
          { s: 'After a crash, an open transaction blocks committed readers for ever.', fact: false, why: 'The coordinator aborts it at <code>transaction.timeout.ms</code>, or sooner when the instance restarts with the same id.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-eos', type: 'design', title: 'Exactly-once into a database',
        prompt: `<p>A service reads <code>payments</code>, computes each merchant's daily total, and must store the totals in PostgreSQL, where a billing system reads them. A total that counts a payment twice means a merchant is overpaid. Design the processing so that each payment affects the stored total exactly once, through crashes and rebalances.</p>`,
        hints: ['Can a Kafka transaction include the database write?', 'Where can you store the consumer\'s position so that it changes together with the total?', 'What stops an old instance from writing after a rebalance?'],
        model: `<p><b>The boundary.</b> A Kafka transaction cannot include PostgreSQL. So use the database's own transaction as the atomic unit, and put the Kafka position inside it.</p><p><b>The design.</b> For each batch, in one database transaction: update the totals, and store the next offset for each partition in an <code>offsets</code> table. Do not commit offsets to Kafka at all, or treat Kafka's as a hint. On start, and whenever partitions are assigned, read the offsets from the table and <code>seek()</code> to them.</p><p><b>Why it is exactly-once.</b> The total and the position change together or not at all. After a crash, the consumer continues from the position the database holds, which matches the totals it holds.</p><p><b>Old instances.</b> After a rebalance, a slow old owner might still write. Guard the offsets row: update it only if the stored offset equals the offset the batch started from. A stale writer updates zero rows and its whole transaction is rolled back.</p><p><b>Alternative.</b> Keep a table of processed payment ids with a unique constraint and insert the id in the same transaction. Simpler, but the table grows and needs cleaning.</p><p><b>Input.</b> If <code>payments</code> is written with transactions, read it with <code>read_committed</code>.</p>`,
        rubric: ['A clear statement that the Kafka transaction does not cover the database', 'Offsets stored in the database in the same transaction as the totals', 'Seek to the stored offsets on start and on assignment', 'A guard against a stale instance after a rebalance', 'The alternative with unique payment ids and its cost', 'read_committed on the input if it is transactional'],
      },
      {
        id: 'ex-boundary', type: 'example', title: 'Three pipelines: where does exactly-once hold?',
        story: `<p>A team says "we turned on exactly-once" for three pipelines. Check each one.</p>`,
        steps: [
          `<b>Pipeline 1:</b> read <code>orders</code>, write enriched orders to <code>orders-enriched</code>, with a transaction for each batch including the offsets. <b>Holds.</b> Everything is in one Kafka cluster.`,
          `<b>Its readers.</b> It holds only for readers that use <code>read_committed</code>. One dashboard consumer used the default and counted aborted records.`,
          `<b>Pipeline 2:</b> read <code>orders</code>, call a shipping service over HTTP, write "shipping requested". <b>Does not hold</b> for the HTTP call. An aborted and retried batch calls the service twice.`,
          `<b>The repair for 2.</b> Split it. Step A writes "please ship order X" to a topic, in a transaction. Step B consumes that topic and calls the service with the order id as a request id, which the service uses to ignore repeats.`,
          `<b>Pipeline 3:</b> read <code>orders</code> in one cluster and write to a topic in another cluster. <b>Does not hold.</b> A transaction cannot span two clusters; the offsets live in the first and the output in the second.`,
          `<b>The repair for 3.</b> Accept at-least-once across clusters and make the consumer on the far side ignore repeats, or use the replication tool's own exactly-once support if your version has it.`,
        ],
        takeaway: `Ask of every step: is the effect inside the same Kafka cluster as the offsets? If not, exactly-once ends there, and you need an id that the receiver checks.`,
      },
    ],

    test: [
      {
        id: 'boss-06', type: 'quizset', title: 'Module 06',
        questions: [
          { q: 'Which call makes the consumer\'s position part of the transaction?', options: ['commitSync()', 'sendOffsetsToTransaction()', 'beginTransaction()', 'flush()'], answer: 1, why: 'It writes the offsets under the same marker as the output.' },
          { q: 'What must every consumer of a transactional topic set to be protected?', options: ['enable.auto.commit=false', 'isolation.level=read_committed', 'group.protocol=consumer', 'Nothing'], answer: 1, why: 'The default shows aborted records.' },
          { q: 'What happens to an older instance when a new one initialises with the same transactional id?', options: ['Both continue', 'The older one is fenced', 'The new one waits', 'The coordinator fails'], answer: 1, why: 'The epoch rises and the old epoch is refused.' },
          { q: 'What bounds how long a crashed producer can block committed readers?', options: ['delivery.timeout.ms', 'transaction.timeout.ms', 'max.poll.interval.ms', 'session.timeout.ms'], answer: 1, why: 'The coordinator aborts the transaction when it passes.' },
          { q: 'A topic\'s end offset is larger than the number of records consumers received. Which explanation fits a transactional topic?', options: ['Data loss', 'Markers and aborted records use offsets', 'Compaction', 'A broken consumer'], answer: 1, why: 'Each commit or abort writes a marker, and aborted records are skipped.' },
        ],
      },
    ],
  },
};
