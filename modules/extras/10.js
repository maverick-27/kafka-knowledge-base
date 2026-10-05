// Activities for module 10, Multi-cluster and design.
window.KB_EXTRAS = {
  module: '10',
  sections: {
    summary: [
      {
        id: 'ex-region', type: 'example', title: 'The night a region went away',
        story: `<p>A delivery company ran one Kafka cluster in one cloud region, with 3 copies of everything across 3 zones. At 01:10 a network fault cut off the whole region for four hours. The company had a standby application stack in a second region, but no Kafka there.</p>`,
        steps: [
          `<b>What the 3 copies protected against.</b> A broker failure and a zone failure. All three zones were in the lost region.`,
          `<b>What stopped.</b> The standby applications started in the second region and had no topics to read or write. Orders could not be dispatched for four hours.`,
          `<b>What was lost.</b> Nothing in the end: the region came back with its data. But nobody knew that at 01:30, and the decision to wait was a gamble.`,
          `<b>The review asked two questions.</b> How much data may we lose in a region failure? And how long may dispatch be down?`,
          `<b>The business answered:</b> a minute of data at most, and 15 minutes of downtime.`,
          `<b>The design that follows.</b> A second cluster in the second region. MirrorMaker 2 copies the critical topics and translates consumer offsets. The copy delay, a few seconds, is the possible loss.`,
          `<b>The part that took longest.</b> Not the copying. Teaching every application the prefixed topic names, making every consumer safe to repeat, and practising the switch until it took 12 minutes.`,
        ],
        takeaway: `Copies inside one cluster protect against failures inside one site. A disaster plan starts from two numbers the business gives you, and it is not finished until the switch has been practised.`,
      },
      {
        id: 'q-async', type: 'quiz', title: 'What can be lost?',
        q: 'A producer writes to the main cluster with <code>acks=all</code>. MirrorMaker 2 copies the topic to a standby cluster, 3 seconds behind. The main site is destroyed. What happens to the last 3 seconds of acknowledged records?',
        options: ['They are on the standby, because of acks=all.', 'They are lost. The producer was answered before they were copied.', 'They are copied later from the main site.', 'The producer sends them again automatically.'],
        answer: 1,
        why: '<code>acks=all</code> covers replicas inside the main cluster. Copying to another cluster is asynchronous. The copy delay is the data you can lose.',
      },
    ],

    model: [
      {
        id: 'flow-mm2', type: 'flow', title: 'A record and an offset cross to the other cluster',
        nodes: ['Producer', 'Main cluster', 'MirrorMaker 2', 'Standby cluster', 'Consumer after failover'],
        steps: [
          { from: 0, to: 1, label: 'order 17', store: [1], chip: 'orders @500', say: 'The producer writes an order to <code>orders</code> on the main cluster. It lands at offset 500.' },
          { from: 1, to: 0, label: 'ok', say: 'The main cluster answers the producer. The record is not on the standby yet.' },
          { from: 1, to: 2, label: 'order 17', say: 'MirrorMaker 2 is a consumer on the main cluster. It reads the record.' },
          { from: 2, to: 3, label: 'order 17', store: [3], chip: 'main.orders @420', say: 'And a producer on the standby. It writes the record to <code>main.orders</code>. There it gets offset 420: a different number.' },
          { at: 2, store: [2], chip: '500 ↔ 420', say: 'From time to time it records a pair: "offset 500 on main is offset 420 on standby".' },
          { at: 1, store: [1], chip: 'group at 498', say: 'A consumer group on the main cluster has committed offset 498.' },
          { from: 2, to: 3, label: 'group at ~410', store: [3], chip: 'group at 410', say: 'MirrorMaker 2 translates that position with its pairs and commits a cautious value for the same group on the standby: a little earlier than exact.' },
          { at: 1, down: [1], say: 'The main site is lost.' },
          { from: 3, to: 4, label: 'from 410', say: 'The group starts on the standby from offset 410 of <code>main.orders</code>. It repeats a few records and misses none of those that were copied.' },
        ],
      },
      {
        id: 'm-dr', type: 'match', title: 'Designs and what they give',
        pairs: [
          ['Active and standby', 'Seconds of data can be lost; failover is a procedure'],
          ['Active and active', 'Both sites serve; conflicting updates are your problem'],
          ['Stretch cluster', 'No committed record lost; sites must be close'],
          ['Recovery point objective', 'How much recent data may be lost'],
          ['Recovery time objective', 'How long the service may be down'],
          ['Share group', 'Many workers on one partition, each record acknowledged alone'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-failover', type: 'order', title: 'A failover, in order',
        q: 'The main site is failing. Click the steps in a safe order.',
        items: ['A named person decides, by a stated rule, to fail over.', 'Stop the copy from the main cluster, so that a half-alive source cannot write.', 'Record the last copied offsets: this is the possible loss.', 'Point producers at the standby cluster.', 'Start consumers on the standby from their translated offsets.', 'Rebuild the old site as the new standby before any switch back.'],
        why: 'The first step is the hardest in a real incident. Decide the rule and the person before the day you need them.',
      },
      {
        id: 'flow-share', type: 'flow', title: 'A worker dies holding a job',
        nodes: ['Partition jobs-0', 'Share group state', 'Worker A', 'Worker B'],
        steps: [
          { at: 0, store: [0], chip: 'job 1, job 2', say: 'Two jobs wait in one partition. Two workers are in the share group <code>workers</code>.' },
          { from: 0, to: 2, label: 'job 1', store: [1], chip: 'job 1: A, try 1', say: 'Worker A fetches. The broker hands it job 1 and notes: acquired by A, delivery 1, lock 30 seconds.' },
          { from: 0, to: 3, label: 'job 2', store: [1], chip: 'job 2: B, try 1', say: 'Worker B fetches from the same partition and gets job 2. A consumer group could not do this.' },
          { from: 3, to: 1, label: 'accept job 2', say: 'Worker B finishes and acknowledges. Job 2 is done.' },
          { at: 2, down: [2], say: 'Worker A crashes with job 1 unfinished. It never acknowledges.' },
          { at: 1, say: 'Thirty seconds pass. The lock on job 1 runs out. The broker marks it available again.' },
          { from: 0, to: 3, label: 'job 1', store: [1], chip: 'job 1: B, try 2', say: 'Worker B fetches again and receives job 1, as delivery 2.' },
          { from: 3, to: 1, label: 'accept job 1', say: 'B finishes it. Job 2 was never delayed by job 1. After 5 failed deliveries the broker would stop offering a job.' },
        ],
      },
      {
        id: 'q-translate', type: 'quiz', title: 'Why translate?',
        q: 'A group committed offset 9,000 on <code>orders</code> in the main cluster. After a failover, why can it not simply start at offset 9,000 of <code>main.orders</code> on the standby?',
        options: ['It can; offsets are the same on both.', 'The copy is a different topic with its own offsets; 9,000 may point to a different record or to nothing.', 'The standby has no offsets.', 'Offsets above 5,000 are not copied.'],
        answer: 1,
        why: 'MirrorMaker 2 writes the copy as a new log. Retention, compaction, markers and the time copying began all make the numbers differ. In the lab, 78 on the source was 73 on the copy.',
      },
    ],

    configs: [
      {
        id: 't-dr', type: 'tune', title: 'Choose a design for a payments platform',
        goal: 'Requirements: <b>no acknowledged payment may be lost</b> if a data centre fails; clients should <b>not have to do anything</b> in a failover; the company has <b>three data centres 2 ms apart</b> in one city.',
        knobs: [
          { id: 'design', label: 'Design', options: [['One cluster in one data centre', 'single'], ['Main and standby with MirrorMaker 2', 'ap'], ['Stretch cluster over the three data centres', 'stretch']], start: 0 },
          { id: 'min', label: 'min.insync.replicas (3 copies)', options: [['1', 1], ['2', 2]], start: 0 },
          { id: 'acks', label: 'Producer acks', options: [['1', '1'], ['all', 'all']], start: 0 },
        ],
        run: (v) => {
          let ok = false, html;
          if (v.design === 'single') html = 'A data centre failure takes the whole cluster. Every copy is in the same building.';
          else if (v.design === 'ap') html = 'Copying to the standby is asynchronous, so the last seconds of acknowledged payments are lost in a failure. And failover needs clients to switch clusters and topic names.';
          else if (v.acks !== 'all') html = 'The cluster spans three data centres, but with acks=1 the leader answers before any other data centre has the payment.';
          else if (v.min < 2) html = 'With a minimum of 1, the in-sync set can shrink to one data centre, and an acknowledged payment may exist only there.';
          else { ok = true; html = 'Each partition has a replica in each data centre. A payment is in two of them before it is acknowledged. Losing a data centre triggers a normal leader election; clients see a short pause and nothing else. This works because the sites are 2 ms apart.\nIt does not protect against losing the whole city. For that, add an asynchronous copy to another region and accept seconds of possible loss there.'; }
          return { ok, html };
        },
      },
      {
        id: 'c-rpo', type: 'calc', title: 'How much is at risk?',
        q: 'A main cluster receives 4,000 records each second. The copy to the standby runs 3 seconds behind. The main site is lost without warning. About how many acknowledged records are missing on the standby?',
        unit: 'records', answer: 12000, tol: 0.05,
        hint: 'Rate times delay.',
        working: '4,000 × 3 = 12,000 records. This is your recovery point in records. If the copy delay grows to 5 minutes during a problem, the number becomes 1,200,000, which is why the delay must be monitored and alerted on.',
      },
    ],

    failures: [
      {
        id: 's-failover', type: 'scenario', title: 'The main region is unreachable',
        intro: 'At 03:20 every connection to the main region fails. The cloud provider\'s status page says "investigating". You have a standby cluster fed by MirrorMaker 2. The agreed limits are 15 minutes of downtime and 1 minute of data.',
        steps: [
          { situation: 'It is 03:24. What do you do first?',
            choices: [
              { label: 'Follow the runbook\'s decision rule: if the region is unreachable for 5 minutes, the on-call lead declares a failover.', good: true, result: 'At 03:25 the rule is met and the lead declares it. No debate at 3 a.m., because the rule was written in daylight.' },
              { label: 'Wait for the provider to say more.', good: false, result: 'At 04:10 the status page still says "investigating". You are 50 minutes into a 15-minute limit.' },
              { label: 'Fail over only the services that complain.', good: false, result: 'Half the services write to one cluster and half to the other. Data for the same customers is now split, with no order between the two.' },
            ] },
          { situation: 'Failover is declared. The main cluster may come back at any moment. What must you do before moving producers?',
            choices: [
              { label: 'Stop MirrorMaker 2 and note the last copied offsets.', good: true, result: 'The copy is stopped. The heartbeat shows the last copied record was written at 03:19:58. Anything after that on the main cluster is not on the standby: the possible loss, well inside the 1-minute limit.' },
              { label: 'Leave the copy running in case the main cluster returns.', good: false, result: 'The main cluster returns for ninety seconds at 03:40 and the copy delivers old records into topics that applications are already writing to on the standby. Order is broken.' },
            ] },
          { situation: 'Producers are now writing to the standby. How do consumers start?',
            choices: [
              { label: 'From their translated offsets, on the prefixed topics, accepting that some records repeat.', good: true, result: 'Each group starts a little before where it was. A few hundred records are processed twice; the consumers ignore the repeats by event id.' },
              { label: 'From the latest offset, to avoid repeats.', good: false, result: 'Every record copied but not yet processed is skipped. Orders placed in the last minutes before the failure are never dispatched.' },
              { label: 'From the earliest offset, to be safe.', good: false, result: 'Every consumer reprocesses a week of data. Dispatch is hours behind.' },
            ] },
          { situation: 'At 06:00 the main region is healthy again. What now?',
            choices: [
              { label: 'Stay on the standby. Rebuild the old main as the new standby, let it catch up, and switch back in a planned window, or not at all.', good: true, result: 'The old main holds a few records the standby never received. They are compared and replayed by hand from the note taken at 03:26. The switch back happens the following week, calmly.' },
              { label: 'Switch everything back at once.', good: false, result: 'The old main lacks three hours of data and contains records the standby never saw. You have created a second, unplanned failover with no offset translation in the other direction.' },
            ] },
        ],
        debrief: 'A failover is four decisions: when to go, how to stop the old path, where consumers start, and when to return. Each has one safe answer, and all four should be written down and practised before the night you need them.',
      },
    ],

    lab: [
      {
        id: 'lab-10', type: 'lab', title: 'Four more experiments',
        intro: '<p>These need the second cluster <code>kafka-dr</code> and the share group from the main lab.</p>',
        tasks: [
          { task: 'Practise a failover. Stop MirrorMaker 2, stop all three main brokers, and consume <code>main.orders</code> on the standby with the group <code>g-new</code> from its translated offset.',
            hint: 'The group resumes a little before its position on the main cluster. Note that the topic name is the prefixed one.' },
          { task: 'Read the heartbeat. Consume the <code>heartbeats</code> topic on the standby while MirrorMaker 2 runs, then stop MirrorMaker 2 and watch it go quiet.',
            hint: 'A steady stream of heartbeat records shows the link is alive. Their timestamps give the copy delay.' },
          { task: 'Add a third worker to the share group while 30 jobs are being sent, and see how the jobs are divided.',
            hint: 'The third worker receives jobs at once. Unlike a consumer group, nothing is reassigned and no worker pauses.' },
          { task: 'Read one topic with both kinds of group at the same time: the share group <code>workers</code> and a consumer group.',
            hint: 'Both receive every record. The share group divides them among its workers; the consumer group gives them, in order, to its one owner.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-10', type: 'tf', title: 'Six statements about multi-cluster and design',
        items: [
          { s: 'Three copies across three zones of one region protect against losing that region.', fact: false, why: 'All three zones are in the region. A region failure needs a second cluster elsewhere.' },
          { s: 'A mirrored topic keeps the same partition for each record.', fact: true, why: 'MirrorMaker 2 keeps key, value, timestamp and partition number. Only the offset is new.' },
          { s: 'MirrorMaker 2, with default settings, skips records of aborted transactions.', fact: false, why: 'In the lab it copied 38 aborted records as ordinary records.' },
          { s: 'In a share group, records of one partition are processed in order.', fact: false, why: 'Records are handed to whichever worker asks. Order is not kept.' },
          { s: 'A stretch cluster needs no offset translation in a failover.', fact: true, why: 'It is one cluster. A site failure is an ordinary leader election.' },
          { s: 'Kafka is a good fit when a caller needs an immediate answer to each message.', fact: false, why: 'That is a direct call. Kafka fits when the sender does not need to wait.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-capstone', type: 'design', title: 'Capstone: the event platform for a payments company',
        prompt: `<p>You join a payments company as a staff engineer. They process 5,000 payments each second at peak across 40 services, in one cloud region with three zones, and a second region is available. Money must never be lost or counted twice. Analysts need 13 months of history. The company has had: a lost-events bug, a region scare, and a schema change that broke six teams.</p><p>Write the one-page design for the event platform. Use every module: topics, producers, consumers, replication, controllers, exactly-once, stream processing, schemas and integration, operations, and disaster recovery. Say what you would <em>not</em> use Kafka for.</p>`,
        hints: ['Start from the two disaster numbers and the "never twice" rule; they drive most choices.', 'Where is the source of truth for a payment: Kafka or a database?', 'Where do 13 months of history live?'],
        model: `<p><b>Shape.</b> A stretch cluster over the three zones for zero loss on a zone failure: brokers in multiples of three with <code>broker.rack</code>, three dedicated controllers, one for each zone. An asynchronous copy of the critical topics to the second region with MirrorMaker 2 and offset translation, for a region failure, with the copy delay as the agreed possible loss.</p><p><b>Topics.</b> 3 copies, minimum 2, unclean election off, automatic creation off. Keys chosen as the smallest thing that must stay in order: the payment id or the account. Partition counts calculated, not guessed.</p><p><b>Producers.</b> <code>acks=all</code>, idempotence, checked send results. Payment events are published through an outbox from each service's database, so that a payment and its event cannot differ.</p><p><b>Consumers.</b> At-least-once, with every handler safe to repeat by event id. The new group protocol and static membership. Dead-letter topics with owners and alerts.</p><p><b>Never twice.</b> Kafka-to-Kafka totals, such as balances and settlement sums, run in Kafka Streams with <code>exactly_once_v2</code>, read with <code>read_committed</code>. Effects outside Kafka use a request id that the receiver checks.</p><p><b>Contracts.</b> A schema registry, <code>FULL_TRANSITIVE</code> on shared topics, compatibility checked in every build.</p><p><b>History.</b> 13 months in a data lake or warehouse fed by sink connectors, or tiered storage; not on broker disks.</p><p><b>Operations.</b> Quotas and access control for each service. Alerts on offline and under-replicated partitions, lag in time, disk, controller health, copy delay. Rolling changes only. A failover that is practised every quarter.</p><p><b>Not Kafka.</b> Request and reply between services, the system of record for balances, and large files.</p>`,
        rubric: ['A stretch cluster for zone failure plus an asynchronous copy for region failure, each with its stated loss', 'Safe topic defaults and calculated partition counts', 'An outbox for payment events', 'Consumers that are safe to repeat, with dead-letter handling', 'Exactly-once limited to Kafka-to-Kafka steps, and ids for outside effects', 'Schemas with a strict compatibility mode', 'History outside broker disks', 'Quotas, access control, alerts and practised failover', 'A list of what Kafka is not used for'],
      },
      {
        id: 'ex-fit', type: 'example', title: 'Three requests: is Kafka the answer?',
        story: `<p>Three teams ask the platform team for "a Kafka topic". A staff engineer's first job is to check the fit.</p>`,
        steps: [
          `<b>Request 1.</b> "Our checkout must ask the fraud service if a payment is allowed, and wait for the answer." A caller waits for a reply. <b>Not Kafka:</b> a direct call with a timeout. Publish the result as an event afterwards if others need it.`,
          `<b>Request 2.</b> "Six teams need every order event, some want to reprocess a month, and volume is 3,000 each second." Many independent readers, replay, volume. <b>Kafka,</b> with a consumer group for each team.`,
          `<b>Request 3.</b> "We send about 200 emails an hour. Each must be retried on failure, and some must be delayed by a day." Low volume, a delay for each message, retries for each message. <b>Not Kafka:</b> a jobs table in their existing database, or a managed queue with delays.`,
          `<b>A second look at request 3.</b> If those emails are triggered by order events that are already in Kafka, the email service consumes the topic and puts jobs in its own table. Kafka carries the events; the table handles the scheduling.`,
          `<b>A fourth request, a week later.</b> "We resize 50 images each second; any worker can take any image." Independent jobs, already on a Kafka platform. <b>Kafka with a share group</b> is a reasonable fit, after checking that their client library supports it.`,
        ],
        takeaway: `Kafka earns its cost when you need a shared, replayable log at volume. For a reply, a delay or a small job list, a simpler tool is the senior answer. Saying no well is part of the job.`,
      },
    ],

    test: [
      {
        id: 'boss-10', type: 'quizset', title: 'Module 10',
        questions: [
          { q: 'Which design loses no committed record when one site fails?', options: ['Active and standby', 'Active and active', 'A stretch cluster with acks=all and a minimum of 2', 'Any design with 3 copies'], answer: 2, why: 'Each record is in two sites before it is acknowledged.' },
          { q: 'What limits where a stretch cluster can be used?', options: ['The number of topics', 'The network delay between the sites', 'The Kafka version', 'The number of consumers'], answer: 1, why: 'Every write and every controller decision waits for another site.' },
          { q: 'What does MirrorMaker 2 change about a copied record?', options: ['Its key', 'Its partition', 'Its offset', 'Its timestamp'], answer: 2, why: 'The copy is a new log with its own offsets.' },
          { q: 'After a failover with translated offsets, what should a consumer expect?', options: ['Skipped records', 'Some repeated records', 'Exactly the next record', 'An error'], answer: 1, why: 'Translation is cautious: it places the group slightly early.' },
          { q: 'Which workload fits a share group?', options: ['Account events that must be applied in order', 'Independent jobs that any worker can take', 'A stream-table join', 'Replaying history in order'], answer: 1, why: 'Share groups give up order to allow many workers on one partition.' },
        ],
      },
    ],
  },
};
