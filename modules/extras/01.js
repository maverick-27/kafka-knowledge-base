// Activities for module 01, The log.
window.KB_EXTRAS = {
  module: '01',
  sections: {
    summary: [
      {
        id: 'ex-rides', type: 'example', title: 'A ride-hailing company puts trip events in a log',
        story: `<p>A ride-hailing app produces an event each time a trip changes: requested, driver assigned, started, finished, paid. Four teams need these events: billing, fraud detection, driver pay, and analytics. Before Kafka, the trip service called each team's service directly.</p>`,
        steps: [
          `<b>The problem with direct calls.</b> When the fraud service was slow, trip updates were slow. When analytics wanted a fifth copy, the trip service had to change. When billing had a bug, the events it mishandled were gone.`,
          `<b>One topic.</b> The trip service writes every event to a topic <code>trip-events</code> and knows nothing about the readers.`,
          `<b>The key is the trip id.</b> All events of one trip go to one partition, so every reader sees "started" before "finished".`,
          `<b>Each team is its own consumer group.</b> Each gets every event and reads at its own speed. A slow fraud service delays only fraud detection.`,
          `<b>Retention is 14 days.</b> When billing fixed its bug, it moved its group back three days and processed those events again. Nobody else was affected.`,
          `<b>A fifth reader.</b> A new "driver ratings" team started a new group from the beginning of the topic. The trip service did not change.`,
        ],
        takeaway: `The log separates writers from readers in three ways: the writer does not know the readers, readers do not affect each other, and readers can go back in time. Those three properties are the reason to choose Kafka.`,
      },
      {
        id: 'q-read', type: 'quiz', title: 'What does reading do?',
        q: 'A consumer reads the record at offset 5 of a partition and commits. What happens to that record in the log?',
        options: ['It is deleted, because it was delivered.', 'Nothing. It stays until retention or compaction removes it.', 'It is marked as read, and other groups skip it.', 'It moves to the end of the partition.'],
        answer: 1,
        why: 'Reading changes nothing in the log. The only thing that changed is the group\'s own committed offset, which is stored elsewhere.',
        hints: ['That is how a classic queue works, not a log.', null, 'Each group has its own position. Groups do not affect each other.', 'Records never move. An offset is fixed for ever.'],
      },
    ],

    model: [
      {
        id: 'flow-journey', type: 'flow', title: 'Four records find their partitions',
        nodes: ['Producer', 'Partition 0', 'Partition 1', 'Partition 2', 'Consumer'],
        steps: [
          { from: 0, to: 2, label: 'user-42', store: [2], chip: '0', say: 'Key <code>user-42</code>: hash, then remainder after division by 3, gives partition 1. It gets offset 0 there.' },
          { from: 0, to: 1, label: 'user-17', store: [1], chip: '0', say: 'Key <code>user-17</code> hashes to partition 0. It also gets offset 0: each partition counts on its own.' },
          { from: 0, to: 2, label: 'user-42', store: [2], chip: '1', say: 'The same key again. The same hash, so the same partition. Offset 1, directly after the first.' },
          { from: 0, to: 3, label: 'user-1', store: [3], chip: '0', say: 'Key <code>user-1</code> goes to partition 2.' },
          { from: 2, to: 4, label: 'offset 0', say: 'A consumer reads partition 1 from offset 0. It receives the first <code>user-42</code> record…' },
          { from: 2, to: 4, label: 'offset 1', say: '…and then the second. The order for <code>user-42</code> is certain, because both records are in one partition.' },
          { at: 4, say: 'Between partitions there is no order. Nothing says whether <code>user-17</code> in partition 0 was written before or after <code>user-1</code> in partition 2.' },
        ],
      },
      {
        id: 'm-terms', type: 'match', title: 'Six words you must own',
        pairs: [
          ['Topic', 'A named stream of records'],
          ['Partition', 'One append-only log; the unit of order'],
          ['Offset', 'The position of a record in its partition'],
          ['Segment', 'One of the files a partition is cut into'],
          ['Active segment', 'The only segment that receives writes'],
          ['Base offset', 'The first offset in a segment; also its file name'],
        ],
        why: 'If you can explain these six without notes, the rest of the module is detail.',
      },
    ],

    internals: [
      {
        id: 'o-write', type: 'order', title: 'The path of a write',
        q: 'Click the steps in the order they happen when a broker receives a batch.',
        items: [
          'The broker checks the batch: size and checksum.',
          'The broker gives the batch the next offsets.',
          'The batch is appended to the active segment, in the page cache.',
          'After about 4 KiB of new data, an entry is added to the index files.',
          'The operating system writes the data to disk in the background.',
        ],
        why: 'Notice what is last: the disk. The broker does not wait for it. Safety comes from copies on other brokers.',
      },
      {
        id: 'q-seg', type: 'quiz', title: 'Find the segment',
        q: 'A partition has segments with base offsets 0, 1000 and 2000. In which file is offset 1999?',
        options: ['00000000000000000000.log', '00000000000000001000.log', '00000000000000002000.log', 'It depends on the index.'],
        answer: 1,
        why: 'The broker picks the segment with the largest base offset that is not above the target. 1000 ≤ 1999 &lt; 2000. The index is used only afterwards, to find the position inside that file.',
        hints: ['That segment ends at offset 999.', null, 'That segment starts at 2000, which is above 1999.', 'The index works inside one segment. The segment is chosen by base offset first.'],
      },
      {
        id: 'flow-retention', type: 'flow', title: 'The retention check visits each segment',
        intro: 'Retention is 7 days. Press "Play".',
        nodes: ['Retention check', 'Segment A', 'Segment B', 'Active segment'],
        steps: [
          { at: 0, say: 'Every 5 minutes the broker checks each partition. For each segment it asks one question: is the <b>newest</b> record in it older than <code>retention.ms</code>?' },
          { from: 0, to: 1, label: 'expired?', say: 'Segment A: its newest record is 9 days old. Older than 7 days, so the whole segment can go.' },
          { at: 1, down: [1], say: 'Segment A is renamed with <code>.deleted</code> and removed a minute later. The log start offset moves forward.' },
          { from: 0, to: 2, label: 'expired?', say: 'Segment B: its newest record is 2 days old. It stays, <b>although its oldest record is 8 days old</b>. Retention never cuts a segment in two.' },
          { from: 0, to: 3, label: 'expired?', say: 'Active segment: it has records from today. It stays. If every record in it had expired, the broker would start a new segment and delete this one too, as the lab showed.' },
          { at: 0, say: 'Result: records up to "retention plus one segment period" old can still be on disk. To tighten that, make segments roll sooner with <code>segment.ms</code>.' },
        ],
      },
    ],

    configs: [
      {
        id: 't-retention', type: 'tune', title: 'Make a quiet topic honour its retention',
        goal: 'A topic gets a few records each hour. The rule: no record older than <b>2 days</b> on disk, and no more than <b>50 segments</b> for each partition. Choose the settings.',
        knobs: [
          { id: 'ret', label: 'retention.ms', options: [['7 days (default)', 168], ['1 day', 24]], start: 0 },
          { id: 'seg', label: 'segment.ms', options: [['7 days (default)', 168], ['1 day', 24], ['1 hour', 1], ['1 minute', 1 / 60]], start: 0 },
        ],
        run: (v) => {
          const worst = v.ret + v.seg, segments = Math.ceil(v.ret / v.seg) + 1;
          const okAge = worst <= 48, okSeg = segments <= 50;
          const days = (h) => (h >= 48 ? (h / 24).toFixed(1) + ' days' : h.toFixed(1) + ' hours');
          let html = 'Oldest record that can be on disk: <b>' + days(worst) + '</b> (retention plus one segment period).\nSegments for each partition: about <b>' + segments.toLocaleString('en-US') + '</b>, each with three files.';
          if (!okAge) html += '\nToo old. Retention acts on whole closed segments, and this segment takes too long to close.';
          if (!okSeg) html += '\nToo many files. With thousands of partitions this reaches the operating system\'s limit on open files.';
          if (okAge && okSeg) html += '\nA segment period near or below the retention time is the usual answer for quiet topics.';
          return { ok: okAge && okSeg, html };
        },
      },
      {
        id: 'c-disk', type: 'calc', title: 'How much disk?',
        q: 'A topic receives 20 MB each second, with no compression. Retention is 3 days. Each partition has 3 copies. How much data is stored in total?',
        unit: 'TB', answer: 15.6, tol: 0.05,
        hint: 'Seconds in 3 days: 259,200. Remember the copies.',
        working: '20 MB × 259,200 seconds = 5,184,000 MB, about 5.2 TB for one copy. Times 3 copies = about 15.6 TB. Then add free space: you would provide about 26 TB.',
      },
    ],

    failures: [
      {
        id: 's-disk', type: 'scenario', title: 'Disk at 91% at two in the morning',
        intro: 'You are on call. An alert says the data disk of broker 2 is 91% full and rising about 1% every 20 minutes. At 100% the broker stops.',
        steps: [
          { situation: 'You have about three hours. What is your first action?',
            choices: [
              { label: 'Find which topics use the space, with <code>kafka-log-dirs.sh</code>.', good: true, result: 'One topic, <code>clickstream</code>, holds 70% of the disk. Now you know where to act.' },
              { label: 'Log in to the broker and delete the oldest <code>.log</code> files by hand.', good: false, result: 'The broker still has those files in its indexes and its memory. Deleting them underneath it can corrupt the partition. Never remove log files by hand.' },
              { label: 'Restart the broker to free space.', good: false, result: 'A restart frees nothing, and the cluster now has one broker less while the others also fill up.' },
            ] },
          { situation: '<code>clickstream</code> has a retention of 7 days. Its consumers are at most one hour behind. What do you change?',
            choices: [
              { label: 'Lower <code>retention.ms</code> on that topic to 2 days for now.', good: true, result: 'The consumers are far inside 2 days, so nothing they need is lost. The change needs no restart.' },
              { label: 'Delete the topic and create it again.', good: false, result: 'Every consumer loses its place and all unread data is gone. Producers fail until the topic is back.' },
              { label: 'Lower <code>retention.ms</code> for every topic on the cluster to 1 hour.', good: false, result: 'Other topics may have consumers that are days behind, or data that must be kept. You would cause data loss in places you did not look at.' },
            ] },
          { situation: 'Three minutes later the disk is still at 91%. What now?',
            choices: [
              { label: 'Wait. The retention check runs every 5 minutes, and files are removed 1 minute after that.', good: true, result: 'Seven minutes after your change the disk drops to 34%.' },
              { label: 'The change did not work. Lower retention to 1 minute.', good: false, result: 'It was working; you were inside the 5-minute check interval. Now you have deleted almost everything, including data the consumers had not read yet.' },
              { label: 'Restart the broker so that it reads the new setting.', good: false, result: 'Topic settings apply without a restart. You removed a broker from service for nothing.' },
            ] },
          { situation: 'The incident is over. What do you do the next morning?',
            choices: [
              { label: 'Find out why the disk filled, set alerts at 60% and 75%, and decide the right retention with the topic\'s owners.', good: true, result: 'Traffic to <code>clickstream</code> had doubled after a launch and nobody had recalculated the disk. You also set <code>retention.bytes</code> on it as a safety limit.' },
              { label: 'Put retention back to 7 days and close the ticket.', good: false, result: 'The disk fills again in five days, at night.' },
            ] },
        ],
        debrief: 'The pattern for any disk incident: measure before you act, make the smallest change that is safe for the consumers, wait for the mechanism, and afterwards remove the cause.',
      },
    ],

    lab: [
      {
        id: 'lab-01', type: 'lab', title: 'Four more things to try on the cluster',
        intro: '<p>Do these after the main lab. Tick each one when you have seen the result yourself.</p>',
        tasks: [
          { task: 'Predict the partition of the key <code>order-9</code> in a topic with 3 partitions. Then produce it and check.',
            hint: 'Use the "key picks the partition" demo near the top of this page, then produce <code>order-9:test</code> to <code>orders</code> and read it back with <code>print.partition=true</code>. You should see partition 1. Do this before the lab of module 09, which raises the partition count.' },
          { task: 'Watch a segment roll by time. Create a topic with <code>segment.ms=10000</code>, produce one record every few seconds for a minute, and list the directory.',
            hint: 'Several <code>.log</code> files appear, each with only a few records. A segment rolls when a record arrives and the active segment is older than <code>segment.ms</code>.' },
          { task: 'Find the offset for a point in time. Note the time, produce a few records, then ask for the first offset at or after that time.',
            hint: 'Run <code>kafka-get-offsets.sh</code> with <code>--time</code> and a timestamp in milliseconds. This uses the <code>.timeindex</code> file. I did not run this exact command in my session.' },
          { task: 'Delete a key from the compacted <code>addresses</code> topic with a tombstone, and confirm it disappears.',
            hint: 'The console producer can send a null value when you set a null marker: add <code>--reader-property null.marker=NULL</code> and send <code>user-2:NULL</code>. After the cleaner has run and <code>delete.retention.ms</code> has passed, <code>user-2</code> is gone from a read from the beginning. I did not run this one in my session.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-01', type: 'tf', title: 'Six statements about the log',
        items: [
          { s: 'Two records with the same key always have neighbouring offsets.', fact: false, why: 'They are in the same partition, but records with other keys can be written between them.' },
          { s: 'A topic with one partition keeps all its records in order.', fact: true, why: 'One partition is one log. The price is that only one consumer in a group can read it.' },
          { s: 'With <code>retention.ms</code> of 1 hour, no record older than 1 hour exists.', fact: false, why: 'A record waits for its whole segment to expire and for the next check.' },
          { s: 'After compaction, the remaining records keep their original offsets.', fact: true, why: 'Offsets never change. The log simply has gaps.' },
          { s: 'Kafka forces every record to disk before it answers the producer.', fact: false, why: 'By default it writes to the page cache. Copies on other brokers give the safety.' },
          { s: 'You can lower a topic\'s partition count if you chose too many.', fact: false, why: 'The count can only go up. Choose with care.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-orders', type: 'design', title: 'Design the topics for an order system',
        prompt: `<p>An online shop takes up to 2,000 orders each second at peak. Each order produces about 6 events (created, paid, packed, shipped, delivered, and sometimes cancelled), 500 bytes each. Four teams consume the events. They must see the events of one order in sequence, and must be able to reprocess the last 30 days. A new service also needs the <em>current</em> status of any order, including orders from last year.</p><p>Propose the topics, keys, cleanup policies and main settings. Estimate the disk.</p>`,
        hints: ['One need is "history for 30 days". The other is "latest value for ever". Can one cleanup policy serve both?', 'Peak events each second: 2,000 × 6.', 'What decides the partition count: the writers or the readers?'],
        model: `<p><b>Two topics.</b> <code>order-events</code>, keyed by order id, with <code>cleanup.policy=delete</code> and 30 days of retention. And <code>order-status</code>, keyed by order id, with <code>cleanup.policy=compact</code>, holding the latest status for each order for ever.</p><p><b>Why the key is the order id:</b> it gives ordering for each order and spreads load evenly. A customer id would also order events, but would put all of a large customer's orders in one partition.</p><p><b>Partitions:</b> peak is 12,000 events each second. If the slowest consumer handles 1,000 each second for each instance, it needs 12 instances; plan for growth and choose 24 or 36. Decide now, because the key makes the count hard to change.</p><p><b>Safety:</b> 3 copies and <code>min.insync.replicas=2</code> on both.</p><p><b>Disk for the event topic:</b> average load is lower than peak; assume 4,000 events each second on average × 500 bytes = 2 MB each second. × 2,592,000 seconds × 3 copies ≈ 15.6 TB before compression, perhaps 4 TB with it.</p><p><b>The compacted topic</b> is bounded by the number of orders, not by time. Set <code>segment.ms</code> to about a day so that the cleaner can work, and decide if finished orders are ever removed with tombstones.</p>`,
        rubric: [
          'Two topics, or one with compact,delete and a clear reason',
          'The key is the order id, with a reason',
          'A partition count worked out from consumer speed, with room to grow',
          'Three copies and a minimum of 2',
          'A disk estimate with the arithmetic shown',
          'A note that the compacted topic needs segments to roll',
        ],
      },
      {
        id: 'ex-logs', type: 'example', title: 'Sizing a logging platform, with the working shown',
        story: `<p>A platform team runs central logging. Applications send 60 MB of log lines each second at peak, 25 MB on average. Lines compress about 5 times. Logs are kept for 7 days. How much disk, and what is easy to get wrong?</p>`,
        steps: [
          `<b>Use the average for disk, the peak for throughput.</b> Disk fills at the average rate: 25 MB each second.`,
          `<b>Apply compression first.</b> 25 ÷ 5 = 5 MB each second reaches the disk, if producers compress.`,
          `<b>One copy for 7 days:</b> 5 MB × 604,800 seconds = 3,024,000 MB, about 3.0 TB.`,
          `<b>Three copies:</b> about 9.1 TB.`,
          `<b>Overshoot:</b> with the default 7-day segment roll, data could live up to 14 days. Set <code>segment.ms</code> to 1 day; then the overshoot is one day in seven, about 15%: 10.4 TB.`,
          `<b>Free space:</b> divide by 0.6 to keep 40% free: about 17.4 TB to provide.`,
          `<b>The trap:</b> if one team turns compression off, its share arrives 5 times larger. Put a produce quota on each team, and alert on disk growth, not only on disk level.`,
        ],
        takeaway: `The simple formula gives 9 TB. The honest answer is 17 TB, and it depends on a setting, compression, that producers control. Staff-level sizing states its assumptions and says who can break them.`,
      },
    ],

    test: [
      {
        id: 'boss-01', type: 'quizset', title: 'Module 01',
        questions: [
          { q: 'Records A and B have the same key. A consumer in another group reads the topic much later. In which order does it see them?',
            options: ['The order they were written', 'Any order', 'B first, because it is newer', 'It depends on the consumer group'], answer: 0,
            why: 'Same key, same partition, fixed order for every reader, while the partition count is unchanged.' },
          { q: 'A topic has <code>retention.ms</code> of 1 day and default segment settings. It gets 10 records each minute. About how old can a record on disk become?',
            options: ['1 day', '2 days', '8 days', '14 days'], answer: 2,
            why: 'The segment closes after 7 days. Then its newest record must be 1 day old before the segment goes: about 8 days.' },
          { q: 'What does the cleaner never touch during compaction?',
            options: ['Tombstones', 'The active segment', 'Records without a value', 'The index files'], answer: 1,
            why: 'Only closed segments are cleaned. That is why a quiet compacted topic needs <code>segment.ms</code>.' },
          { q: 'Which statement about offsets is true?',
            options: ['They are unique across a topic', 'They are reused after retention deletes records', 'They can have gaps', 'They are assigned by the producer'], answer: 2,
            why: 'Compaction and transaction markers leave gaps. Offsets are per partition, never reused, and assigned by the broker.' },
          { q: 'A team raises a topic from 6 to 12 partitions. Which risk is real?',
            options: ['Existing records are moved to the new partitions', 'New records for a key can go to a different partition from its old records', 'Consumers must be restarted', 'Retention is reset'], answer: 1,
            why: 'The partition is the key\'s hash modulo the count. Old records stay; new ones may land elsewhere, so order for that key is lost across the change.' },
        ],
      },
    ],
  },
};
