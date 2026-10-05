// Activities for module 02, Producers.
window.KB_EXTRAS = {
  module: '02',
  sections: {
    summary: [
      {
        id: 'ex-fire', type: 'example', title: 'The payment service that lost one event in ten thousand',
        story: `<p>A payment service sent a "payment captured" event to Kafka after each charge. Finance noticed that a few events each day were missing. The service logs showed no errors at all.</p>`,
        steps: [
          `<b>The code.</b> It called <code>producer.send(record)</code> and moved on. It never looked at the result.`,
          `<b>What send() does.</b> It puts the record in a batch in memory and returns at once. The network request happens later, in another thread.`,
          `<b>Where the failures went.</b> During each broker restart, some batches reached their delivery timeout. The error was placed in the future that <code>send()</code> returned. Nobody read the future.`,
          `<b>The first fix.</b> A callback on every send that logs the error and counts it in a metric. The team could now see the loss: 40 events in one deployment night.`,
          `<b>The second fix.</b> The charge and the event were still two separate steps. The team moved to an outbox table, so that an event exists whenever a charge exists. Module 08 explains the pattern.`,
          `<b>The check.</b> A daily job compares the count of charges with the count of events. It has shown zero difference since.`,
        ],
        takeaway: `"No errors in the log" means nothing if the code never asks for the errors. Every <code>send()</code> needs a callback or a checked future, and a count you can alert on.`,
      },
      {
        id: 'q-send', type: 'quiz', title: 'When is it written?',
        q: 'Your code calls <code>send()</code> and the call returns without an exception. What do you know?',
        options: ['The record is on the leader\'s disk.', 'The record is on all in-sync brokers.', 'The record is in the producer\'s memory, waiting in a batch.', 'The record was sent on the network.'],
        answer: 2,
        why: 'The return of <code>send()</code> only means the record was accepted into a batch. It is written when the future completes without an error.',
      },
    ],

    model: [
      {
        id: 'flow-batch', type: 'flow', title: 'Three records, one request',
        nodes: ['Your code', 'Batch for partition 0', 'Sender thread', 'Leader broker'],
        steps: [
          { from: 0, to: 1, label: 'r1', store: [1], chip: 'r1', say: '<code>send(r1)</code>. The record is serialized, given a partition, and added to that partition\'s open batch. The call returns.' },
          { from: 0, to: 1, label: 'r2', store: [1], chip: 'r2', say: '<code>send(r2)</code>, one millisecond later. It joins the same batch.' },
          { from: 0, to: 1, label: 'r3', store: [1], chip: 'r3', say: '<code>send(r3)</code>. Still the same batch. It is far from 16,384 bytes.' },
          { at: 2, say: '5 milliseconds have passed since the batch was opened: <code>linger.ms</code>. The sender thread takes the batch.' },
          { from: 2, to: 3, label: 'r1 r2 r3', clear: [1], store: [3], chip: 'batch', say: 'One request carries all three records. The leader stores the batch as one unit.' },
          { from: 3, to: 0, label: 'ok', say: 'The leader answers. The three futures complete and your three callbacks run, each with its partition and offset.' },
        ],
      },
      {
        id: 'm-prod', type: 'match', title: 'Which setting does what?',
        pairs: [
          ['batch.size', 'Upper size of one batch, in bytes'],
          ['linger.ms', 'Longest wait for a batch to fill'],
          ['acks', 'How many brokers must have the record before the answer'],
          ['delivery.timeout.ms', 'Total time allowed for one record, with all retries'],
          ['buffer.memory', 'Memory for records that wait to be sent'],
          ['max.block.ms', 'How long send() may wait when that memory is full'],
        ],
        why: 'The first two control batching, the third safety, the fourth retries, and the last two what happens under overload.',
      },
    ],

    internals: [
      {
        id: 'o-send', type: 'order', title: 'Inside one send',
        q: 'Click the steps in the order the producer performs them.',
        items: ['Serialize the key and the value to bytes.', 'Choose the partition from the key\'s hash.', 'Add the record to the open batch for that partition.', 'The sender thread sends the batch to the partition\'s leader.', 'The broker answers, and the callback runs.'],
        why: 'The first three happen in your thread. The last two happen later, in the sender thread.',
      },
      {
        id: 'flow-idem', type: 'flow', title: 'A lost answer, with idempotence on',
        nodes: ['Producer (id 16)', 'Network', 'Leader broker'],
        steps: [
          { from: 0, to: 2, label: 'A seq 0', store: [2], chip: 'A', say: 'The producer sends batch A with producer id 16 and sequence 0. The leader writes it.' },
          { from: 2, to: 1, label: 'ok', fail: true, say: 'The leader answers, but the answer is lost on the network.' },
          { at: 0, say: 'The producer waits for <code>request.timeout.ms</code>, hears nothing, and decides to retry.' },
          { from: 0, to: 2, label: 'A seq 0', say: 'The same batch again, with the same producer id and the same sequence 0.' },
          { at: 2, say: 'The leader sees it has already written sequence 0 for producer 16. It writes <b>nothing</b>.' },
          { from: 2, to: 0, label: 'ok', say: 'The leader answers "success" again. The log holds A once. Without idempotence it would now hold A twice.' },
        ],
      },
      {
        id: 'q-timeout', type: 'quiz', title: 'How long does the producer keep trying?',
        q: 'A partition\'s leader is unreachable. The producer has default settings. When does it report an error for a record sent to that partition?',
        options: ['After 3 retries', 'After <code>request.timeout.ms</code>, 30 seconds', 'After <code>delivery.timeout.ms</code>, 2 minutes', 'Never; it retries for ever'],
        answer: 2,
        why: '<code>retries</code> is practically unlimited. The delivery timeout is the real limit, and it covers the wait in the batch, every attempt and every pause.',
      },
    ],

    configs: [
      {
        id: 't-prod', type: 'tune', title: 'Tune a clickstream producer',
        goal: 'Target: at least <b>500,000 records each second</b>, at most <b>30 ms</b> of added wait, and <b>no acknowledged record lost</b> if a broker fails. The throughput numbers come from this module\'s lab.',
        knobs: [
          { id: 'batch', label: 'batch.size', options: [['1 byte', 1], ['16384 (default)', 16384], ['131072', 131072]], start: 0 },
          { id: 'linger', label: 'linger.ms', options: [['0', 0], ['5 (default)', 5], ['20', 20], ['100', 100]], start: 0 },
          { id: 'acks', label: 'acks', options: [['0', '0'], ['1', '1'], ['all', 'all']], start: 1 },
        ],
        run: (v) => {
          let thr = v.batch === 1 ? 13 : v.batch === 16384 ? 400 : 710;
          if (v.batch > 1 && v.linger === 0) thr = Math.round(thr * 0.8);
          const okThr = thr >= 500, okWait = v.linger <= 30, okSafe = v.acks === 'all';
          let html = 'About <b>' + thr + ',000</b> records each second. Added wait: up to <b>' + v.linger + ' ms</b>. Acknowledged data safe on broker failure: <b>' + (okSafe ? 'yes' : 'no') + '</b>.';
          if (!okThr) html += '\n' + (v.batch === 1 ? 'One record in each request: the lab measured 13,244 each second this way.' : 'The batches are too small for the target. A larger batch.size carries more in each request.');
          if (!okWait) html += '\nEvery record can wait up to ' + v.linger + ' ms. That breaks the 30 ms limit.';
          if (!okSafe) html += '\nWith acks=' + v.acks + ' a record can be lost on leader failure after the producer was told it succeeded' + (v.acks === '0' ? ', or without any answer at all.' : '.');
          if (okThr && okWait && okSafe) html += '\nLarge batches and a short wait give the throughput. In the lab, acks=all cost nothing measurable.';
          return { ok: okThr && okWait && okSafe, html };
        },
      },
      {
        id: 'c-batches', type: 'calc', title: 'How many requests?',
        q: 'A producer sends 10,000 records each second, 200 bytes each, all to one partition, with <code>linger.ms=5</code> and the default <code>batch.size</code>. How many batches does it send each second?',
        unit: 'batches each second', answer: 200, tol: 0.05,
        hint: 'How many records arrive in 5 milliseconds? Is that batch full?',
        working: 'In 5 ms, 50 records arrive: 10,000 bytes. That is below 16,384 bytes, so the batch leaves because of linger, not because it is full. One batch every 5 ms is 200 batches each second, in place of 10,000 requests.',
      },
    ],

    failures: [
      {
        id: 's-ner', type: 'scenario', title: 'Every write to one topic fails',
        intro: 'At 10:14 the order service starts logging <code>NOT_ENOUGH_REPLICAS</code> for the topic <code>orders</code>. Other topics are fine. Orders are queuing in the service.',
        steps: [
          { situation: 'What do you look at first?',
            choices: [
              { label: 'Describe the topic and read the in-sync set of each partition.', good: true, result: 'Replicas 1, 2, 3. In-sync set: only broker 1. The topic has <code>min.insync.replicas=2</code>. The leader is refusing writes it cannot protect.' },
              { label: 'Restart the order service.', good: false, result: 'The service is behaving correctly. After the restart it gets the same error, and you have lost the records that were waiting in its memory.' },
              { label: 'Raise <code>delivery.timeout.ms</code> in the producer.', good: false, result: 'The producer now waits longer for the same refusal. The cause is on the broker side.' },
            ] },
          { situation: 'Brokers 2 and 3 are both out of sync for this topic. Broker 3 is down for planned maintenance. Broker 2 is running. What next?',
            choices: [
              { label: 'Find out why broker 2 fell out of sync: check its disk, network and logs.', good: true, result: 'Broker 2\'s data disk is very slow; a hardware fault. It cannot keep up as a follower.' },
              { label: 'Set <code>min.insync.replicas=1</code> on the topic so that writes continue.', good: false, result: 'Writes continue, with every new order on exactly one broker. If broker 1 fails now, those orders are gone, and the producers were told they were safe.' },
              { label: 'Change the producers to <code>acks=1</code>.', good: false, result: 'The same loss of protection, and in this Kafka version the records would not even be visible to consumers until the in-sync set recovers.' },
            ] },
          { situation: 'Broker 2 needs a disk replacement that takes an hour. Broker 3\'s maintenance can be stopped. What do you do?',
            choices: [
              { label: 'Stop the maintenance and bring broker 3 back, then wait for it to rejoin the in-sync set.', good: true, result: 'Broker 3 catches up in four minutes. The in-sync set is 1 and 3, the minimum is met, and writes resume. Then you take broker 2 out for repair.' },
              { label: 'Force an unclean leader election.', good: false, result: 'The partition has a leader already; the problem is the in-sync minimum. An unclean election could only lose data here.' },
            ] },
          { situation: 'What do you change so that this cannot happen the same way again?',
            choices: [
              { label: 'A rule: no planned maintenance unless under-replicated partitions is 0, and an alert on that number.', good: true, result: 'The maintenance on broker 3 started while broker 2 was already struggling. The check would have stopped it.' },
              { label: 'Lower the minimum to 1 everywhere, so that one broker is always enough.', good: false, result: 'That removes the protection the minimum exists to give.' },
            ] },
        ],
        debrief: '<code>NOT_ENOUGH_REPLICAS</code> is the cluster keeping its promise. The fix is always to restore replicas, never to weaken the promise.',
      },
    ],

    lab: [
      {
        id: 'lab-02', type: 'lab', title: 'Four more experiments',
        intro: '<p>Each one shows a producer behaviour you will meet in production.</p>',
        tasks: [
          { task: 'Measure what <code>linger.ms</code> alone does. Run the performance tool three times with <code>batch.size=131072</code> and <code>linger.ms</code> of 0, 5 and 50.',
            hint: 'The tool sends as fast as it can, so batches fill before the wait ends and the three results are close. Linger matters for slow, steady producers. Limit the tool with <code>--throughput 1000</code> and compare again.' },
          { task: 'See a hot partition. Send 9 records with the key <code>big-customer</code> and 3 with other keys to <code>perf</code>, then read the offsets of each partition.',
            hint: 'One partition grows by at least 9. Every record for one key lands in one partition, however busy that key is.' },
          { task: 'Trigger a "record too large" error. Send one record of 2,000,000 bytes with the performance tool: <code>--num-records 1 --record-size 2000000</code>.',
            hint: 'The producer refuses before it sends, because the record is above <code>max.request.size</code>. Raising only that setting moves the error to the broker, which has its own limit.' },
          { task: 'Compare two compression types on your own data. Repeat step 2 of the lab with <code>gzip</code> and <code>lz4</code> and compare the file sizes.',
            hint: 'gzip gives smaller files and uses more processor time; lz4 is the reverse. The right choice depends on which resource is short.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-02', type: 'tf', title: 'Six statements about producers',
        items: [
          { s: 'A producer object can be shared by many threads.', fact: true, why: 'It is safe for threads, and one shared producer builds better batches than many small ones.' },
          { s: '<code>acks=all</code> waits for every replica of the partition.', fact: false, why: 'It waits for every replica that is in sync at that moment.' },
          { s: 'With idempotence on, the same event can never be in a topic twice.', fact: false, why: 'It covers the producer\'s own retries in one session. An application that sends twice, or sends again after a restart, still creates a duplicate.' },
          { s: 'Compression is applied to each record separately.', fact: false, why: 'It is applied to a whole batch, which is why larger batches compress better.' },
          { s: 'A full batch is sent at once, even if <code>linger.ms</code> has not passed.', fact: true, why: 'Linger is the longest wait, not a fixed delay.' },
          { s: 'Lowering <code>retries</code> is a good way to avoid duplicates.', fact: false, why: 'Idempotence removes the duplicates. Fewer retries only lose more records.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-two', type: 'design', title: 'Two producers, two sets of settings',
        prompt: `<p>Your company has two producers. <b>A:</b> a payments service, 300 events each second, each one worth money, called from a web request that must answer in 200 ms. <b>B:</b> a clickstream collector, 80,000 events each second, where losing a few is acceptable but a slow collector drops user traffic.</p><p>Give the producer settings for each, the topic settings they rely on, and what each application does when a send fails.</p>`,
        hints: ['Which one can accept waiting 20 ms for a batch?', 'What does a web request handler do if <code>send()</code> blocks for a minute?', 'Is <code>acks=1</code> ever the right answer?'],
        model: `<p><b>A, payments.</b> Defaults for safety: <code>acks=all</code>, idempotence on. Topic with 3 copies and a minimum of 2. Keep <code>linger.ms</code> low (0 to 5); volume is small, so batching gains little. Set <code>max.block.ms</code> and <code>delivery.timeout.ms</code> well below the usual values, for example 5 and 30 seconds, so that a broker problem turns into a clear error and does not hold web requests. On failure: do not drop the event. Best is an outbox table, written in the same database transaction as the payment, so that the request does not depend on Kafka at all.</p><p><b>B, clickstream.</b> <code>batch.size=131072</code>, <code>linger.ms=20</code>, <code>compression.type=lz4</code>. Keep <code>acks=all</code>: the lab showed no measurable cost, and it avoids silent loss. Give <code>buffer.memory</code> room, and a low <code>max.block.ms</code> so that the collector never stalls: on a full buffer it drops the event and counts it. Alert on the drop count.</p><p><b>Both:</b> a <code>client.id</code>, a callback that counts errors, and a quota for B so that it cannot starve A on a shared cluster.</p>`,
        rubric: ['acks=all and idempotence for payments, with the topic minimum of 2', 'Short blocking and delivery limits for code that runs inside a web request', 'Large batches, a linger and compression for clickstream', 'A stated action on failure for each: never drop for payments, drop and count for clicks', 'An outbox or an equivalent for the payment event', 'A client id, error metrics, and a quota'],
      },
      {
        id: 'ex-skew', type: 'example', title: 'One customer, one hot partition',
        story: `<p>A logistics company keys its <code>shipment-events</code> topic by customer id, with 12 partitions. One consumer group has 12 instances. Eleven are idle most of the time. One is always behind.</p>`,
        steps: [
          `<b>Measure.</b> The end offsets of the partitions show that partition 7 receives 62% of all records.`,
          `<b>Find the key.</b> A sample of partition 7 shows one customer id on almost every record: a large retailer that sends half of all shipments.`,
          `<b>Why more partitions do not help.</b> A key maps to one partition. With 24 or 240 partitions, this customer is still in exactly one of them.`,
          `<b>What ordering is really needed?</b> Events must be in order for each <em>shipment</em>, not for each customer.`,
          `<b>The fix.</b> Key by shipment id. The large customer's shipments now spread over all partitions, and each shipment still stays in order.`,
          `<b>The migration.</b> Changing the key changes where records go, so order is lost across the switch. The team created a new topic with the new key, moved the producers, let consumers finish the old topic, and then switched them.`,
        ],
        takeaway: `Choose the key as the smallest thing that must stay in order. A key that is larger than needed, such as a customer when you need a shipment, concentrates load and cannot be fixed with more partitions.`,
      },
    ],

    test: [
      {
        id: 'boss-02', type: 'quizset', title: 'Module 02',
        questions: [
          { q: 'A producer sends 100 records each second. Which setting has the largest effect on how many requests it makes?', options: ['buffer.memory', 'linger.ms', 'max.block.ms', 'retries'], answer: 1, why: 'At a low rate, batches do not fill. The wait decides how many records share a request.' },
          { q: 'With <code>acks=1</code>, when can an acknowledged record be lost?', options: ['Never', 'When the leader fails before a follower has copied the record', 'When a follower fails', 'When the consumer is slow'], answer: 1, why: 'The leader answered alone. The new leader never had the record.' },
          { q: 'What lets the broker detect that a batch is a repeat?', options: ['The record key', 'The timestamp', 'Producer id, epoch and sequence number', 'The batch checksum'], answer: 2, why: 'Those three identify a batch from one producer session for one partition.' },
          { q: '<code>send()</code> blocks for a minute and then throws a timeout. Which is a likely cause?', options: ['The consumer group is rebalancing', 'The producer\'s buffer memory is full', 'The topic uses compaction', 'The batch is too small'], answer: 1, why: 'A full buffer, or missing metadata, makes send() wait up to <code>max.block.ms</code>.' },
          { q: 'Why can the producer keep 5 requests in flight and still keep order?', options: ['The network keeps order', 'The broker rejects a batch whose sequence number leaves a gap, and the producer resends in order', 'Batches carry timestamps', 'It cannot; order needs 1 in flight'], answer: 1, why: 'With idempotence, the broker tracks the last five batches and refuses out-of-sequence ones.' },
        ],
      },
    ],
  },
};
