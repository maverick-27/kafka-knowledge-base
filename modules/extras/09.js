// Activities for module 09, Operations.
window.KB_EXTRAS = {
  module: '09',
  sections: {
    summary: [
      {
        id: 'ex-review', type: 'example', title: 'The capacity review that prevented an outage',
        story: `<p>A cluster of 6 brokers with 4 TB disks had run without trouble for a year. Disks were at 58%. A new engineer was asked to "check that we are fine for the sale in November", when traffic triples for five days.</p>`,
        steps: [
          `<b>Today.</b> 58% of 24 TB is about 13.9 TB, with 7 days of retention. So about 2 TB arrives each day across the cluster.`,
          `<b>The sale.</b> Three times the traffic for 5 days: 6 TB each day.`,
          `<b>Disk at the end of the sale.</b> The 7-day window then holds 5 sale days and 2 normal days: 5 × 6 + 2 × 2 = 34 TB. The cluster has 24 TB.`,
          `<b>When does it fill?</b> During the third day of the sale.`,
          `<b>Option one: more disk.</b> Add 4 brokers and rebalance partitions. That copies terabytes and must be finished before the sale.`,
          `<b>Option two: less retention.</b> Ask each topic owner what they need. The largest topic, clickstream, is read within an hour by every consumer. With 2 days of retention for it, the peak stays well inside the 24 TB.`,
          `<b>Option three: compression.</b> Two large producers send uncompressed JSON. Turning on lz4 cuts their share by about four.`,
          `<b>Decision.</b> Options two and three now, with alerts at 60% and 75%, and new brokers ordered for January.`,
        ],
        takeaway: `"We are at 58% and it has been fine" is not a capacity plan. Work out the rate, apply the future, and find the day the disk fills, while there is still time to choose the cheap fix.`,
      },
      {
        id: 'q-cache', type: 'quiz', title: 'Where should the memory go?',
        q: 'A broker machine has 64 GB of memory. How should it be used?',
        options: ['Give about 60 GB to the broker\'s Java heap.', 'Give the Java heap a modest amount and leave most to the operating system.', 'Split it evenly.', 'It does not matter.'],
        answer: 1,
        why: 'Kafka serves recent data from the operating system\'s page cache. A huge heap takes that memory away and makes pauses longer.',
      },
    ],

    model: [
      {
        id: 'flow-roll', type: 'flow', title: 'Restart one broker safely',
        nodes: ['Operator', 'Broker 1', 'Broker 2', 'Broker 3'],
        steps: [
          { from: 0, to: 1, label: 'health?', say: 'Before anything: are there under-replicated partitions? The answer must be zero.' },
          { at: 1, store: [1, 2, 3], chip: 'in sync', say: 'All three brokers are in sync for every partition.' },
          { from: 0, to: 1, label: 'stop', say: 'The operator stops broker 1 cleanly. It first hands its leaderships to brokers 2 and 3.' },
          { at: 1, down: [1], clear: [1], say: 'Broker 1 is down. Every partition now has two in-sync replicas. Writes continue. Protection is reduced.' },
          { from: 0, to: 1, label: 'start', up: [1], say: 'The operator applies the change and starts broker 1.' },
          { from: 2, to: 1, label: 'missed data', say: 'Broker 1 copies what it missed from the current leaders.' },
          { from: 3, to: 1, label: 'missed data', store: [1], chip: 'in sync', say: 'It rejoins every in-sync set. Under-replicated partitions is zero again.' },
          { from: 0, to: 2, label: 'health?', say: '<b>Only now</b> may the operator touch broker 2. Stopping it one step earlier would have left some partitions with a single in-sync replica, and blocked writes.' },
        ],
      },
      {
        id: 'm-signals', type: 'match', title: 'What each signal means',
        pairs: [
          ['Offline partitions above 0', 'Data cannot be read or written now'],
          ['Under-replicated partitions above 0', 'Redundancy is reduced; nothing is broken yet'],
          ['Active controller count is 0', 'No metadata change is possible'],
          ['In-sync set shrinks and expands often', 'A broker is at its limit, or the network is unstable'],
          ['Request handler idle share is low', 'The broker\'s request threads are saturated'],
          ['Consumer lag in time is growing', 'An application processes slower than data arrives'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-size', type: 'order', title: 'Sizing, in order',
        q: 'Click the sizing steps in a sensible order.',
        items: ['Measure the write rate, average and peak.', 'Multiply by retention time and by the number of copies.', 'Divide by the real compression ratio.', 'Add the retention overshoot and free space.', 'Check network and throughput for the case that one broker has failed.', 'Test on the real hardware.'],
        why: 'The first four give disk. The fifth is the one people forget. The sixth replaces assumptions with measurements.',
      },
      {
        id: 'flow-quota', type: 'flow', title: 'A client goes over its quota',
        nodes: ['Client', 'Broker', 'Other clients'],
        steps: [
          { at: 1, say: 'The client <code>batch-loader</code> has a produce quota of 5 MB each second. The broker measures its rate over a window of 11 seconds.' },
          { from: 0, to: 1, label: '40 MB', say: 'The client sends 40 MB in one second.' },
          { from: 1, to: 0, label: 'ok', say: 'The broker accepts it. A quota does not reject data. Over the 11-second window, 40 MB is still below 55 MB: a burst is allowed.' },
          { from: 0, to: 1, label: '40 MB', say: 'The client keeps going: another 40 MB.' },
          { at: 1, say: 'Now the window holds 80 MB. That is above 5 MB × 11 seconds. The client is over its quota.' },
          { from: 1, to: 0, label: 'ok, wait 5 s', say: 'The broker accepts the data again, but its answer says: wait before your next request. It also stops reading from that connection for that time.' },
          { from: 2, to: 1, label: 'requests', say: 'Meanwhile the other clients are served normally. That is the purpose: one heavy client cannot take the broker from everyone.' },
          { at: 0, say: 'Over a longer time the client averages its quota. This is why the lab\'s 4-second test showed only partial slowing.' },
        ],
      },
      {
        id: 'q-load', type: 'quiz', title: 'After a failure',
        q: 'A cluster has 4 brokers with evenly spread load. One fails. How much more load does each remaining broker carry?',
        options: ['25% more', 'About 33% more', '50% more', 'The same'],
        answer: 1,
        why: 'Each of the three now carries one third of the total, where it carried one quarter: 4 ÷ 3 = 1.33. A broker at 80% before the failure would need 107% after it.',
      },
    ],

    configs: [
      {
        id: 't-cluster', type: 'tune', title: 'Size the cluster',
        goal: 'Workload: <b>80 MB each second</b> written, <b>7 days</b> retention, 3 copies, compression 4 times. Rules: disks at most <b>60%</b> full, and the cluster must still fit on disk <b>after one broker fails</b> (under 85%).',
        knobs: [
          { id: 'n', label: 'Brokers', options: [['3', 3], ['6', 6], ['9', 9], ['12', 12]], start: 0 },
          { id: 'disk', label: 'Disk for each broker', options: [['2 TB', 2], ['4 TB', 4], ['8 TB', 8]], start: 0 },
        ],
        run: (v) => {
          const stored = (80 * 604800 * 3) / 4 / 1e6;
          const total = v.n * v.disk, pct = (stored / total) * 100, after = (stored / ((v.n - 1) * v.disk)) * 100;
          const ok = pct <= 60 && after <= 85;
          let html = 'Stored data: 80 × 604,800 × 3 ÷ 4 = <b>' + stored.toFixed(1) + ' TB</b>.\nCluster disk: ' + total + ' TB. Disks are <b>' + pct.toFixed(0) + '%</b> full. After one broker fails and its data is rebuilt on the others: <b>' + after.toFixed(0) + '%</b>.';
          if (pct > 100) html += '\nThe data does not fit at all.';
          else if (pct > 60) html += '\nToo full for a normal day. No room for growth, a reassignment, or a bad week.';
          else if (after > 85) html += '\nFine on a normal day, but one failure pushes the remaining disks too high.';
          else html += '\nThis fits with room. Now check the same for network and for the write throughput of one broker.';
          if (ok && total > stored * 3.3) html += '\nIt is also well above the need. A smaller layout would meet the rules for less money.';
          return { ok, html };
        },
      },
      {
        id: 'c-fail', type: 'calc', title: 'Load after a failure',
        q: 'A cluster of 6 brokers runs at 60% of each broker\'s throughput limit. One broker fails. At what percentage do the remaining five run?',
        unit: '%', answer: 72, tol: 0.03,
        hint: 'The same total load is carried by five in place of six.',
        working: 'Total load is 6 × 60 = 360 units. Five brokers carry it: 360 ÷ 5 = 72%. Still safe. At 85% before the failure it would be 102% after: the cluster would fall over exactly when it has lost a broker.',
      },
    ],

    failures: [
      {
        id: 's-latency', type: 'scenario', title: 'Produce latency triples with no change in traffic',
        intro: 'At 14:05, the 99th percentile produce latency on broker 4 rises from 15 ms to 60 ms. Write traffic is flat. The other brokers are normal. Several services report slower requests.',
        steps: [
          { situation: 'One broker, flat write traffic. What do you compare first?',
            choices: [
              { label: 'Disk reads and network out on broker 4 against the other brokers.', good: true, result: 'Disk read throughput on broker 4 jumped from almost zero to 180 MB each second at 14:04. Normally a broker reads almost nothing from disk, because recent data is in memory.' },
              { label: 'Restart broker 4.', good: false, result: 'Its partitions move to other brokers, the heavy reads follow the leaders, and now two brokers are slow.' },
              { label: 'Add partitions to the busiest topic.', good: false, result: 'This changes nothing about what the disk is doing, and breaks key ordering.' },
            ] },
          { situation: 'Something is reading old data from broker 4\'s disk. How do you find who?',
            choices: [
              { label: 'Look for a consumer group whose position is far behind, and at fetch rates for each client id on that broker.', good: true, result: 'A group named <code>ml-backfill</code> started at 14:04 from the earliest offset of a 3 TB topic. It fetches as fast as it can.' },
              { label: 'Check the producers.', good: false, result: 'The producers are unchanged. They are the victims.' },
            ] },
          { situation: 'The backfill is legitimate work for another team. How do you protect production now?',
            choices: [
              { label: 'Put a fetch quota on the backfill\'s client id.', good: true, result: 'With a limit of 20 MB each second, disk reads fall, recent data stays in memory, and produce latency returns to 15 ms. The backfill runs slower but it runs.' },
              { label: 'Delete the backfill\'s consumer group.', good: false, result: 'The job restarts from the beginning and does the same thing again.' },
              { label: 'Lower the topic\'s retention so that there is less old data.', good: false, result: 'You delete data that the backfill and perhaps others need, to fix a rate problem.' },
            ] },
          { situation: 'What do you put in place for the future?',
            choices: [
              { label: 'Default quotas for every client, a named process for large replays, and consider tiered storage so that old reads do not use broker disks.', good: true, result: 'The next backfill starts with a quota from the first second.' },
              { label: 'Forbid reading from the earliest offset.', good: false, result: 'Replay is one of the main reasons to use a log. The answer is to control its rate, not to ban it.' },
            ] },
        ],
        debrief: 'Unexplained produce latency with flat writes is very often a reader of cold data. The fix is a quota, which exists exactly so that one client cannot take a shared resource from the rest.',
      },
    ],

    lab: [
      {
        id: 'lab-09', type: 'lab', title: 'Four more experiments',
        intro: '<p>These turn the checks of this module into habits.</p>',
        tasks: [
          { task: 'Do a full rolling restart of the three lab brokers, with the three health checks before and after each one.',
            hint: 'Find the active controller first and restart it last. After each <code>docker restart</code>, wait until <code>--under-replicated-partitions</code> prints nothing.' },
          { task: 'Make a quota visible. Set a produce quota of 1 MB each second on a client id and run the performance tool for at least two minutes with that id.',
            hint: 'Use about 600,000 records of 200 bytes. The reported rate settles near 1 MB each second and the latency is high. A short run does not show this.' },
          { task: 'Write a one-line "top topics by size" for broker 1 from the output of <code>kafka-log-dirs.sh</code>.',
            hint: 'The tool prints JSON. Sum the <code>size</code> of each partition by topic name and sort. The <code>perf</code> topic is the largest on the lab cluster.' },
          { task: 'List every topic with settings different from the cluster defaults.',
            hint: '<code>kafka-topics.sh --describe --topics-with-overrides</code> shows them. Each override is a decision someone made; can you say why for each?' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-09', type: 'tf', title: 'Six statements about operations',
        items: [
          { s: 'A broker with 20% free disk is safe.', fact: false, why: 'One broker failure or one reassignment can use that. Plan for about 40% free.' },
          { s: 'A quota makes the broker reject requests over the limit.', fact: false, why: 'It delays responses. Bursts inside the measuring window pass.' },
          { s: 'Topic settings can be changed without restarting brokers.', fact: true, why: 'They are stored in the metadata log and apply at once.' },
          { s: 'Under-replicated partitions above zero means data is unavailable.', fact: false, why: 'It means reduced redundancy. Offline partitions means unavailable.' },
          { s: 'Tiered storage keeps the active segment on the broker.', fact: true, why: 'Only closed segments are copied to remote storage.' },
          { s: 'Plain-text listeners with no authorizer are fine inside a company network.', fact: false, why: 'Anyone who reaches a port can read, write and delete everything.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-tenants', type: 'design', title: 'One cluster, thirty teams',
        prompt: `<p>Your company wants one shared Kafka platform for 30 product teams. In the past, one team's mistake has taken others down: a runaway producer filled disks, and a replay slowed every broker. Design the rules and the technical controls that make sharing safe. Say what you would <em>not</em> put on the shared cluster.</p>`,
        hints: ['Which resources can one client take from the others?', 'Who is allowed to create a topic, and with which settings?', 'When is a separate cluster the better answer?'],
        model: `<p><b>Identity.</b> Every application authenticates as its own user and sets a client id. Without identity, nothing below can be enforced or traced.</p><p><b>Access.</b> Access control lists by team prefix: a team can read and write only topics under its own prefix, plus topics explicitly shared with it.</p><p><b>Quotas.</b> Default produce and fetch quotas for every user, raised on request. A request-time quota to stop one client from saturating broker threads. A quota on bulk replays in particular.</p><p><b>Topics.</b> Automatic creation off. Topics are created through a reviewed request that enforces 3 copies, a minimum of 2, a stated retention with a size limit, a named owner, and a justified partition count. A cap on partitions for each team.</p><p><b>Data contracts.</b> A schema for every shared topic, with a compatibility mode, checked before release.</p><p><b>Visibility.</b> Dashboards for each team: lag in time, error rates, disk used by their topics. Chargeback or at least show-back of storage.</p><p><b>Not on the shared cluster.</b> Flows whose failure is a company emergency, such as payments, which get a cluster with stricter change control. Workloads with very different shapes, such as huge batch loads. And regulated data that needs separate access rules.</p>`,
        rubric: ['Authentication and a client id for every application', 'Access control by team', 'Produce, fetch and request quotas, including for replays', 'Controlled topic creation with enforced settings and an owner', 'Schemas for shared topics', 'A statement of what gets its own cluster, and why'],
      },
      {
        id: 'ex-parts', type: 'example', title: 'A team asks for 500 partitions',
        story: `<p>A new team requests a topic with 500 partitions "to be safe for scale". Their service handles payment notifications. Work out what they need.</p>`,
        steps: [
          `<b>Ask for the peak rate.</b> 4,000 notifications each second today. They expect four times that in two years: 16,000.`,
          `<b>Ask what one consumer handles.</b> They measured 800 each second for each instance, limited by a database write.`,
          `<b>Consumers needed at the future peak.</b> 16,000 ÷ 800 = 20 instances.`,
          `<b>Partitions.</b> At least 20. Add spare and round to a number that divides well: 24 or 36.`,
          `<b>Ask about keys.</b> Records are keyed by account, and order matters. So the count is very hard to change later. That argues for the higher value, 36, not for 500.`,
          `<b>What 500 would cost.</b> With 3 copies, 1,500 replicas for one topic: more files, more memory, slower failover, and producers that spread 4,000 records over 500 partitions and so send tiny batches.`,
          `<b>The better lever.</b> Batching the database writes would raise each consumer from 800 to perhaps 5,000 each second. Then 16,000 needs 4 instances. Fix the consumer before you add partitions.`,
        ],
        takeaway: `A partition count is the result of a calculation: future peak ÷ what one consumer handles, with room, checked against keys. A round large number is a guess, and guesses in this field are permanent.`,
      },
    ],

    test: [
      {
        id: 'boss-09', type: 'quizset', title: 'Module 09',
        questions: [
          { q: 'Which number is the best early warning that a cluster is losing protection?', options: ['Offline partitions', 'Under-replicated partitions', 'Bytes in', 'Topic count'], answer: 1, why: 'It rises before anything is unavailable.' },
          { q: '10 MB each second, 7 days, 3 copies, no compression. How much is stored?', options: ['About 6 TB', 'About 18 TB', 'About 60 TB', 'About 2 TB'], answer: 1, why: '10 × 604,800 × 3 = 18,144,000 MB, about 18 TB.' },
          { q: 'What must be zero before you restart the next broker?', options: ['Consumer lag', 'Under-replicated partitions', 'Bytes out', 'Controller epoch'], answer: 1, why: 'Otherwise a second broker down can block writes.' },
          { q: 'A consumer starts reading a huge topic from the beginning. What is the typical effect on the broker?', options: ['None', 'Disk reads rise and recent data is pushed out of memory, slowing others', 'The topic is locked', 'Retention stops'], answer: 1, why: 'Old data is not in the page cache.' },
          { q: 'What is the purpose of <code>broker.rack</code>?', options: ['Faster disks', 'To spread the replicas of each partition over racks or zones', 'To name the broker', 'To set quotas'], answer: 1, why: 'So that one rack or zone failure does not take all copies.' },
        ],
      },
    ],
  },
};
