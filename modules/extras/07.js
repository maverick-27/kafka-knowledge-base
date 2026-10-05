// Activities for module 07, Kafka Streams.
window.KB_EXTRAS = {
  module: '07',
  sections: {
    summary: [
      {
        id: 'ex-fraud', type: 'example', title: 'Flagging a card that is used too fast',
        story: `<p>A payments company wants an alert when one card makes more than 5 payments in one minute. Payments arrive in a topic <code>payments</code>, 3,000 each second, keyed by payment id.</p>`,
        steps: [
          `<b>What must be remembered?</b> A count for each card for each minute. That is state, and it must survive a crash.`,
          `<b>Regroup by card.</b> The topic is keyed by payment id, so payments of one card are in many partitions. <code>groupBy(card)</code> makes Streams write them to a repartition topic keyed by card.`,
          `<b>Window.</b> A tumbling window of one minute, on the payment's own timestamp, so that a payment that arrives late still lands in its right minute.`,
          `<b>Count.</b> <code>count()</code> keeps the number for each card and window in a window store, backed by a changelog topic.`,
          `<b>Filter and emit.</b> Convert the table of counts to a stream, keep records where the count is above 5, and write them to <code>card-alerts</code>.`,
          `<b>Late data.</b> Phones send some payments 30 seconds late. A grace period of one minute keeps each window open for them.`,
          `<b>Scale.</b> The input has 12 partitions. Four instances share 12 tasks for each of the two sub-topologies. A fifth instance can be added with no code change.`,
        ],
        takeaway: `Group by the thing you count, window by event time, keep the count in a store that Kafka backs up. Five short steps of code hide two internal topics and a fault-tolerant database.`,
      },
      {
        id: 'q-where', type: 'quiz', title: 'Where does it run?',
        q: 'You deploy a Kafka Streams application. Where does the processing happen?',
        options: ['On the Kafka brokers', 'On a separate Streams cluster that you must install', 'Inside your own application\'s process', 'On the controllers'],
        answer: 2,
        why: 'Kafka Streams is a library. The brokers only store the input, output and internal topics.',
      },
    ],

    model: [
      {
        id: 'flow-topology', type: 'flow', title: 'One sentence through the word count',
        nodes: ['Input topic', 'Split', 'Repartition topic', 'Count + store', 'Output topic'],
        steps: [
          { at: 0, store: [0], chip: '"the fox the"', say: 'One record arrives in the input topic. It has no key.' },
          { from: 0, to: 1, label: 'the fox the', say: 'The first sub-topology reads it and splits it into three records, one for each word.' },
          { from: 1, to: 2, label: 'the, fox, the', store: [2], chip: 'the fox the', say: 'The key becomes the word. The records are written to the repartition topic, so that all records for "the" are in one partition.' },
          { from: 2, to: 3, label: 'the', store: [3], chip: 'the=1', say: 'The second sub-topology reads "the". The store has no count for it: the count becomes 1.' },
          { from: 3, to: 4, label: 'the 1', store: [4], chip: 'the 1', say: 'The change is sent to the output topic, and also to the changelog topic.' },
          { from: 2, to: 3, label: 'fox', store: [3], chip: 'fox=1', say: '"fox": count 1.' },
          { from: 3, to: 4, label: 'fox 1', store: [4], chip: 'fox 1', say: 'Sent on.' },
          { from: 2, to: 3, label: 'the', store: [3], chip: 'the=2', say: '"the" again. The store holds 1, so the count becomes 2.' },
          { from: 3, to: 4, label: 'the 2', store: [4], chip: 'the 2', say: 'The output has two records for "the": 1 and then 2. The table has one row for it. A consumer that keeps the latest value for each key sees the table.' },
        ],
      },
      {
        id: 'm-streams', type: 'match', title: 'Streams vocabulary',
        pairs: [
          ['KStream', 'Each record is a separate event'],
          ['KTable', 'Each record replaces the value for its key'],
          ['State store', 'Local storage for what a step must remember'],
          ['Changelog topic', 'A compacted topic that backs up one store'],
          ['Repartition topic', 'Regroups records after the key changed'],
          ['Task', 'Processing for one sub-topology and one partition'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-restore', type: 'order', title: 'A task moves to another instance',
        q: 'An instance fails. Click what happens to one of its stateful tasks, in order.',
        items: ['The group notices the instance is gone and rebalances.', 'The task is assigned to another instance.', 'That instance reads the task\'s changelog partition and rebuilds the store.', 'It reads the committed offset of the input partition.', 'It processes new input records.'],
        why: 'The third step is restoration. It can take minutes for a large store, which is why standby replicas exist.',
      },
      {
        id: 'flow-standby', type: 'flow', title: 'Failover with and without a warm copy',
        nodes: ['Instance A', 'Changelog topic', 'Instance B (standby)', 'Instance C'],
        steps: [
          { at: 0, store: [0], chip: 'store: 40 GB', say: 'Instance A runs a task with a 40 GB store. Every change to the store is also written to the changelog topic.' },
          { from: 0, to: 1, label: 'changes', store: [1], chip: '40 GB', say: 'The changelog holds the full content of the store.' },
          { from: 1, to: 2, label: 'changes', store: [2], chip: 'copy: 40 GB', say: 'Instance B is a standby replica for this task. It reads the changelog all the time and keeps a warm copy on its own disk.' },
          { at: 0, down: [0], say: 'Instance A fails.' },
          { at: 2, rename: [[2, 'Instance B (active)']], say: 'The task goes to B, because it has the store already. B reads the last few changes and starts processing in seconds.' },
          { at: 3, say: 'Without a standby, the task would go to an instance with an empty disk, such as C.' },
          { from: 1, to: 3, label: '40 GB', store: [3], chip: 'restoring…', say: 'C would read all 40 GB from the changelog first. At 50 MB each second that is more than 13 minutes with no processing for this task.' },
        ],
      },
      {
        id: 'q-tasks', type: 'quiz', title: 'Count the tasks',
        q: 'A topology has two sub-topologies, because of one repartition step. The input topic has 6 partitions. How many tasks does the application have?',
        options: ['2', '6', '12', '36'],
        answer: 2,
        why: 'One task for each sub-topology and partition: 2 × 6 = 12. The lab showed the same pattern: 2 × 3 gave the six directories <code>0_0</code> to <code>1_2</code>.',
      },
    ],

    configs: [
      {
        id: 't-streams', type: 'tune', title: 'Settings for a stateful application',
        goal: 'The application holds 40 GB of state. Requirements: fail over in <b>under a minute</b>; a planned restart must <b>not rebuild the store</b>; totals in the output must <b>never count an input twice</b>.',
        knobs: [
          { id: 'standby', label: 'num.standby.replicas', options: [['0 (default)', 0], ['1', 1]], start: 0 },
          { id: 'dir', label: 'state.dir', options: [['the temporary directory (default)', 'tmp'], ['a disk that survives restarts', 'disk']], start: 0 },
          { id: 'pg', label: 'processing.guarantee', options: [['at_least_once', 'alo'], ['exactly_once_v2', 'eos']], start: 0 },
        ],
        run: (v) => {
          const okFail = v.standby >= 1, okRestart = v.dir === 'disk', okOnce = v.pg === 'eos';
          let html = 'Failover under a minute: <b>' + (okFail ? 'yes' : 'no') + '</b>. Restart keeps the store: <b>' + (okRestart ? 'yes' : 'no') + '</b>. No double counting: <b>' + (okOnce ? 'yes' : 'no') + '</b>.';
          if (!okFail) html += '\nWith no standby, the new owner restores 40 GB from the changelog first: about 13 minutes at 50 MB each second.';
          if (!okRestart) html += '\nThe temporary directory can be cleared, and in a container it is lost at every restart. Each restart then restores everything.';
          if (!okOnce) html += '\nWith at-least-once, a crash between writing output and committing offsets applies some input twice. For totals that is a wrong number.';
          if (okFail && okRestart && okOnce) html += '\nThe cost: a second copy of the state on another instance, a durable volume for each instance, and more frequent commits.';
          return { ok: okFail && okRestart && okOnce, html };
        },
      },
      {
        id: 'c-restore', type: 'calc', title: 'How long is the restore?',
        q: 'A state store\'s changelog holds 30 GB. An instance with an empty disk restores at 50 MB each second. How long until its task can process?',
        unit: 'minutes', answer: 10, tol: 0.05,
        hint: '30 GB is 30,000 MB.',
        working: '30,000 MB ÷ 50 MB each second = 600 seconds = 10 minutes. During that time the task processes nothing and its input lag grows.',
      },
    ],

    failures: [
      {
        id: 's-reset', type: 'scenario', title: 'After a release, every count starts from zero',
        intro: 'A Streams application counts page views for each article. A release went out an hour ago. The dashboard now shows every article with a count near zero.',
        steps: [
          { situation: 'What do you check first?',
            choices: [
              { label: 'The list of internal topics for this application id, before and after the release.', good: true, result: 'There are now two changelog topics: <code>…-STATE-STORE-0000000003-changelog</code>, full of data, and a new <code>…-STATE-STORE-0000000005-changelog</code>, almost empty.' },
              { label: 'The broker disk space.', good: false, result: 'Disks are fine. This costs you ten minutes.' },
              { label: 'Run the application reset tool.', good: false, result: 'The reset tool deletes the internal topics, including the old changelog with the real counts. Now the history is gone for good.' },
            ] },
          { situation: 'The release added a filter step before the count. Why is there a new changelog?',
            choices: [
              { label: 'Internal topic names contain a generated number. The new step shifted the numbers, so the count now uses a new, empty store.', good: true, result: 'Exactly. The old store is untouched but nothing reads it.' },
              { label: 'Kafka deleted the old data.', good: false, result: 'The old changelog still has everything. Nothing was deleted.' },
            ] },
          { situation: 'How do you bring the counts back?',
            choices: [
              { label: 'Release again with the count step given an explicit name that matches the old store, so that the application uses the old changelog.', good: true, result: 'The application restores from the old changelog and the counts return. The views from the last hour, counted in the new store, are replayed from the input topic for that hour.' },
              { label: 'Roll back to the old version and never add steps again.', good: false, result: 'Rolling back restores the counts, but the application can never be changed. The cause is unnamed steps, not change itself.' },
            ] },
          { situation: 'What becomes a rule for this team?',
            choices: [
              { label: 'Every stateful step and every repartition gets an explicit name, and a test compares the topology description between releases.', good: true, result: 'Internal topic names no longer depend on the position of a step in the code.' },
              { label: 'Change the application id at each release.', good: false, result: 'A new id is a new application with no state at all. That is the same incident, on purpose, every release.' },
            ] },
        ],
        debrief: 'In Kafka Streams the names of internal topics are part of your data model. Name them yourself, or a harmless refactoring becomes data loss.',
      },
    ],

    lab: [
      {
        id: 'lab-07', type: 'lab', title: 'Four more experiments',
        intro: '<p>These use the word-count example from the main lab.</p>',
        tasks: [
          { task: 'Run two instances. Start the example in <code>kafka-1</code> and in <code>kafka-2</code> (install <code>libstdc++</code> there too), and describe the group <code>streams-wordcount</code> with <code>--members --verbose</code>.',
            hint: 'The six tasks are split between the two instances. Each instance has its own state directories for the tasks it owns.' },
          { task: 'Read the changelog as a table. Consume the changelog topic from the beginning and keep only the last value you see for each word.',
            hint: 'The last value for each word equals the current count. After compaction has run, older values disappear from the topic by themselves.' },
          { task: 'See the repartition topic being purged. Compare its earliest and latest offsets a minute after sending input.',
            hint: 'The earliest offset moves forward although retention is unlimited: Streams deletes records it has processed.' },
          { task: 'Kill one of two instances and time how long until output continues for all words.',
            hint: 'With a tiny store the restore is instant, so the delay you see is the group noticing the dead instance: up to the session timeout.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-07', type: 'tf', title: 'Six statements about Kafka Streams',
        items: [
          { s: 'If an instance loses its local disk, its state is lost.', fact: false, why: 'The state is rebuilt from the changelog topic. The lab deleted the directory and the count continued from 5 to 6.' },
          { s: 'Windows use the record\'s own timestamp by default.', fact: true, why: 'This is event time. A late record still goes to its right window, within the grace period.' },
          { s: 'A table sends one record downstream for each key.', fact: false, why: 'It sends one for each change, minus those merged by the cache.' },
          { s: 'Adding instances beyond the number of tasks adds throughput.', fact: false, why: 'Extra instances have no task to run. They are spares.' },
          { s: 'Two topics must have the same partition count to be joined as stream and table.', fact: true, why: 'They must be co-partitioned, unless the table is a GlobalKTable.' },
          { s: 'Changing the application id keeps the existing state.', fact: false, why: 'A new id means new internal topics and a new consumer group. Everything starts empty.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-join', type: 'design', title: 'Enrich orders with customer data',
        prompt: `<p>Orders arrive in <code>orders</code> (keyed by order id, 24 partitions, 5,000 each second). Each must be enriched with the customer's current tier and country from <code>customers</code>, a compacted topic of 50 million customers keyed by customer id, with 12 partitions. The result goes to <code>orders-enriched</code>. Design the Streams topology and its operation.</p>`,
        hints: ['The order\'s key is not the customer id. What must happen before a join?', 'The partition counts differ. What are your options?', 'What should happen to an order whose customer is not in the table yet?'],
        model: `<p><b>The join key.</b> The join is on customer id, but orders are keyed by order id. First re-key the order stream by customer id (<code>selectKey</code>), which creates a repartition topic.</p><p><b>Co-partitioning.</b> The repartitioned orders must have the same partition count as <code>customers</code>: 12. Set the repartition topic to 12 partitions explicitly and name it.</p><p><b>Table or global table.</b> 50 million rows is too large to load into every instance as a <code>GlobalKTable</code>. Use a <code>KTable</code>: each task holds only its partition's customers.</p><p><b>The join.</b> A stream-table left join, so that an order with an unknown customer still flows, with empty customer fields and a marker, and can be repaired later. An inner join would drop it silently.</p><p><b>Timing.</b> Set <code>max.task.idle.ms</code> above zero so that at start-up the table is loaded before orders are joined against it.</p><p><b>Output key.</b> Re-key the result by order id before writing, if downstream consumers expect that.</p><p><b>Operation.</b> The customer store is large: put <code>state.dir</code> on a durable disk, use one standby replica, and name the store. Decide on <code>exactly_once_v2</code> by asking whether a duplicate enriched order hurts the consumers.</p>`,
        rubric: ['Re-key orders by customer id before the join', 'Make the partition counts equal, with an explicit, named repartition topic', 'KTable and not GlobalKTable, with the size as the reason', 'A left join, or a stated plan for orders with no customer', 'max.task.idle.ms so that the table loads first', 'Durable state, a standby replica and named stores'],
      },
      {
        id: 'ex-late', type: 'example', title: 'Counting rides for each hour when phones are offline',
        story: `<p>A ride company counts finished rides for each city and hour, to pay driver bonuses. Drivers' phones lose signal in tunnels and car parks, so some "ride finished" events arrive minutes late. Finance complains that the hourly numbers are lower than the monthly report.</p>`,
        steps: [
          `<b>Which time?</b> The count must use the time the ride finished, not the time the event arrived. Streams uses the record's timestamp, so make sure the producer sets it to the finish time.`,
          `<b>The window.</b> Tumbling, one hour, grouped by city.`,
          `<b>What happened to late events.</b> The window had no grace period configured that fitted the data. Events that arrived after the window closed were dropped. The dropped-records metric showed thousands each day.`,
          `<b>Measure the lateness.</b> 99% of events arrive within 2 minutes, 99.9% within 15 minutes, and a few arrive hours late.`,
          `<b>Choose a grace period.</b> 15 minutes covers 99.9%. Each hour's count now stays open for updates until quarter past the next hour.`,
          `<b>The price.</b> A "final" number for an hour is known 15 minutes later. Finance accepts that.`,
          `<b>The rest.</b> Events later than 15 minutes are still dropped by the window. They are also written to a <code>late-rides</code> topic, and a daily job corrects the bonuses from it.`,
        ],
        takeaway: `Late data forces a choice between complete and fast. Measure how late your data really is, set the grace period from that, and give the remainder a slower path instead of losing it.`,
      },
    ],

    test: [
      {
        id: 'boss-07', type: 'quizset', title: 'Module 07',
        questions: [
          { q: 'What backs up a state store?', options: ['A snapshot on the broker', 'A compacted changelog topic', 'The output topic', 'Nothing'], answer: 1, why: 'Every change to the store is written to its changelog topic.' },
          { q: 'When does Streams create a repartition topic?', options: ['Always', 'When the key changes before a step that groups or joins by key', 'When exactly-once is on', 'When there are two instances'], answer: 1, why: 'Records with the same new key must reach the same task.' },
          { q: 'What limits the number of instances that can do useful work?', options: ['The number of brokers', 'The number of tasks, from the input partition count', 'The number of state stores', 'The commit interval'], answer: 1, why: 'A task runs on one instance at a time.' },
          { q: 'What does a grace period control?', options: ['How long a window accepts late records after its end', 'How long a restore may take', 'How long a join waits for a table', 'How long state is kept on disk'], answer: 0, why: 'Records later than that are dropped by the window.' },
          { q: 'Why give stateful steps explicit names?', options: ['For nicer logs', 'So that internal topic names stay the same when the topology changes', 'It makes processing faster', 'It is required'], answer: 1, why: 'Generated names depend on the order of steps; a change can point the application at a new, empty store.' },
        ],
      },
    ],
  },
};
