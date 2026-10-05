// Activities for module 03, Consumers.
window.KB_EXTRAS = {
  module: '03',
  sections: {
    summary: [
      {
        id: 'ex-email', type: 'example', title: 'The welcome email that some users got three times',
        story: `<p>A service consumed a <code>user-registered</code> topic and sent a welcome email for each record. After every deployment, a few hundred users received the email two or three times.</p>`,
        steps: [
          `<b>The code.</b> Poll 500 records, send 500 emails, and let auto-commit save the position every 5 seconds.`,
          `<b>What a deployment does.</b> The old instance is stopped in the middle of a batch. Emails for the first 300 records are sent. The position was last committed before this batch.`,
          `<b>The new owner.</b> Another instance takes the partition and starts from the committed offset. It sends those 300 emails again.`,
          `<b>Is this a bug in Kafka?</b> No. It is at-least-once delivery, working as designed. The service was not safe to repeat.`,
          `<b>Fix one: repeat less.</b> Commit after each small batch, and commit when partitions are taken away. Use the new group protocol so that a deployment moves fewer partitions.`,
          `<b>Fix two: make repeats harmless.</b> Before sending, insert the user id into a "welcome sent" table with a unique constraint. If the insert fails, skip the email. Now a repeat does nothing.`,
        ],
        takeaway: `You cannot remove repeats from a consumer by tuning alone. Reduce them, and then make the action safe to repeat with an id that the receiving side checks.`,
      },
      {
        id: 'q-idle', type: 'quiz', title: 'Scaling out',
        q: 'A topic has 4 partitions. You scale its consumer group from 4 to 8 instances. What changes?',
        options: ['Throughput doubles.', 'Each partition is now read by two instances.', 'Four instances own one partition each; four are idle.', 'The group fails to start.'],
        answer: 2,
        why: 'One partition has one owner in a consumer group. The extra instances are spares that take over if another one fails.',
      },
    ],

    model: [
      {
        id: 'flow-poll', type: 'flow', title: 'A consumer joins, reads and commits',
        nodes: ['Consumer A', 'Group coordinator', 'Partition 0 leader', '__consumer_offsets'],
        steps: [
          { from: 0, to: 1, label: 'join', say: 'On its first <code>poll()</code>, consumer A finds the coordinator for its group and asks to join.' },
          { from: 1, to: 0, label: 'you own P0', say: 'The coordinator answers with an assignment: partition 0.' },
          { from: 0, to: 1, label: 'position?', say: 'A asks where the group stopped on partition 0.' },
          { from: 1, to: 0, label: 'offset 42', say: 'The committed offset is 42: the next record to read.' },
          { from: 0, to: 2, label: 'fetch 42', say: 'A sends a fetch request to the leader of partition 0, starting at 42.' },
          { from: 2, to: 0, label: '42…46', say: 'The leader returns records 42 to 46. <code>poll()</code> hands them to your code.' },
          { at: 0, say: 'Your code processes the five records. Nothing has been saved yet: a crash now means they are read again.' },
          { from: 0, to: 1, label: 'commit 47', say: 'A commits offset 47: one past the last record it finished.' },
          { from: 1, to: 3, label: '47', store: [3], chip: 'P0=47', say: 'The coordinator writes the offset as a record in the compacted topic <code>__consumer_offsets</code>.' },
        ],
      },
      {
        id: 'm-guar', type: 'match', title: 'Guarantees and what causes them',
        pairs: [
          ['At most once', 'Commit first, then process'],
          ['At least once', 'Process first, then commit'],
          ['Exactly once', 'Process and commit as one atomic step'],
          ['Lag', 'Log end offset minus committed offset'],
          ['Rebalance', 'Partitions change owner inside the group'],
          ['Static membership', 'A fixed instance id, so a quick restart moves nothing'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-poll', type: 'order', title: 'The first poll',
        q: 'Click the steps in the order a new consumer goes through them.',
        items: ['Find the group coordinator.', 'Join the group and receive an assignment.', 'Ask for the committed offset of each assigned partition.', 'Fetch records from the partition leaders.', 'Process the records.', 'Commit the new position.'],
        why: 'If step 3 finds no committed offset, <code>auto.offset.reset</code> decides where to start.',
      },
      {
        id: 'flow-fail', type: 'flow', title: 'A consumer dies mid-batch',
        nodes: ['Consumer A', 'Group coordinator', 'Partition 0', 'Consumer B'],
        steps: [
          { from: 2, to: 0, label: '100…104', say: 'A receives records 100 to 104. The committed offset is 100.' },
          { at: 0, say: 'A processes 100, 101 and 102.' },
          { at: 0, down: [0], say: 'A crashes. Nothing was committed after 100.' },
          { at: 1, say: 'The coordinator hears no heartbeat from A. After the session timeout, 45 seconds, it removes A from the group.' },
          { from: 1, to: 3, label: 'you own P0', say: 'The coordinator gives partition 0 to consumer B.' },
          { from: 3, to: 1, label: 'position?', say: 'B asks for the committed offset.' },
          { from: 1, to: 3, label: 'offset 100', say: 'It is still 100.' },
          { from: 2, to: 3, label: '100…104', say: 'B reads from 100. Records 100, 101 and 102 are processed a second time. Nothing is lost. This is at-least-once.' },
        ],
      },
      {
        id: 'q-commit', type: 'quiz', title: 'Which number?',
        q: 'A consumer has finished processing the record at offset 41. Which offset does it commit?',
        options: ['40', '41', '42', 'It depends on the batch size'],
        answer: 2,
        why: 'The committed offset is the next record to read. Committing 41 would process that record again after a restart.',
      },
    ],

    configs: [
      {
        id: 't-slow', type: 'tune', title: 'A consumer whose records are slow',
        goal: 'Each record takes about <b>0.4 seconds</b> to process, because of a call to another service. Keep the consumer in the group: one batch must finish in at most <b>half</b> of the poll interval. And a consumer that is stuck must be noticed within <b>10 minutes</b>.',
        knobs: [
          { id: 'recs', label: 'max.poll.records', options: [['500 (default)', 500], ['100', 100], ['50', 50], ['10', 10]], start: 0 },
          { id: 'int', label: 'max.poll.interval.ms', options: [['5 minutes (default)', 300], ['10 minutes', 600], ['30 minutes', 1800]], start: 0 },
        ],
        run: (v) => {
          const batch = v.recs * 0.4, okBatch = batch <= v.int / 2, okDetect = v.int <= 600;
          let html = 'One batch takes about <b>' + batch + ' seconds</b>. The poll interval is ' + v.int + ' seconds, so the safe limit is ' + v.int / 2 + ' seconds.\nA stuck consumer is noticed after <b>' + v.int / 60 + ' minutes</b>.';
          if (!okBatch) html += '\nThe batch is too slow. A slower moment in the other service pushes it past the interval, the consumer is removed, and another instance repeats the whole batch.';
          if (!okDetect) html += '\nThe interval is so long that a consumer hung in a loop holds its partitions for ' + v.int / 60 + ' minutes before anyone takes over.';
          if (okBatch && okDetect) html += '\nSmaller batches are the first tool. Raise the interval only when the batches cannot shrink.';
          return { ok: okBatch && okDetect, html };
        },
      },
      {
        id: 'c-drain', type: 'calc', title: 'How long to catch up?',
        q: 'A group is 1,200,000 records behind. Producers write 2,000 records each second. After a fix, the group consumes 3,000 each second. How long until the lag is zero?',
        unit: 'minutes', answer: 20, tol: 0.05,
        hint: 'The lag shrinks only by the difference between the two rates.',
        working: 'The group gains 3,000 − 2,000 = 1,000 records each second. 1,200,000 ÷ 1,000 = 1,200 seconds = 20 minutes. If the group could only do 2,000 each second, it would never catch up.',
      },
    ],

    failures: [
      {
        id: 's-poison', type: 'scenario', title: 'One partition stops moving',
        intro: 'The lag alert for the group <code>invoice-writer</code> fires. Eleven of twelve partitions have a lag near zero. Partition 7 has a lag of 40,000 and it is growing.',
        steps: [
          { situation: 'What does this pattern suggest, and what do you check?',
            choices: [
              { label: 'One partition only: probably one record. Check if the committed offset of partition 7 is moving at all, and read the consumer\'s log.', good: true, result: 'The committed offset has been 881,204 for an hour. The log shows the same parse error again and again, followed by a restart.' },
              { label: 'The group is too slow. Add more consumer instances.', good: false, result: 'The topic has 12 partitions and the group has 12 instances. New instances have nothing to own, and partition 7 stays stuck.' },
              { label: 'Add partitions to the topic.', good: false, result: 'The stuck record is still in partition 7, and you have now broken key ordering for the whole topic.' },
            ] },
          { situation: 'The record at offset 881,204 has a malformed amount field. The consumer throws, restarts, reads it again. How do you unblock the partition?',
            choices: [
              { label: 'Stop the group, move partition 7\'s offset forward by one with the offsets tool, save the bad record somewhere, start the group.', good: true, result: 'The partition drains in a few minutes. The bad record is saved in a ticket with its topic, partition and offset, so that finance can handle that one invoice by hand.' },
              { label: 'Reset the whole group to the latest offset.', good: false, result: 'Partition 7 moves, and 40,000 invoices in it are skipped, with a few hundred in the other partitions.' },
              { label: 'Delete the topic and ask the producer to send everything again.', good: false, result: 'Every other consumer of the topic loses its data and its position, for one bad record.' },
            ] },
          { situation: 'How do you stop the next bad record from doing the same?',
            choices: [
              { label: 'Catch the error in the consumer, send the record to a dead-letter topic with the reason, commit, continue. Alert on that topic.', good: true, result: 'The next malformed record costs one alert and no outage.' },
              { label: 'Wrap the processing in a try and ignore all errors.', good: false, result: 'The partition never stops again, and invoices disappear without anyone knowing.' },
            ] },
          { situation: 'Which alert would have found this an hour sooner?',
            choices: [
              { label: 'An alert when a partition\'s committed offset has not moved for some minutes while its end offset has.', good: true, result: 'This catches a stuck partition directly. A threshold on total lag only fires when the backlog is already large.' },
              { label: 'A lower threshold on total lag for the group.', good: false, result: 'It would fire constantly at busy times, and people would start to ignore it.' },
            ] },
        ],
        debrief: 'Lag on all partitions means "too slow". Lag on one partition means "stuck on one record" or "one hot key". Read the shape before you act.',
      },
    ],

    lab: [
      {
        id: 'lab-03', type: 'lab', title: 'Four more experiments',
        intro: '<p>These make the group mechanics visible.</p>',
        tasks: [
          { task: 'Start three consumers in one group on the 6-partition topic <code>events</code>, describe the group, then start a fourth and describe it again.',
            hint: 'Three members own two partitions each. With four, two members own two and two own one. Use <code>--members --verbose</code> to see the partitions of each member.' },
          { task: 'Watch the session timeout. Start a consumer, then stop it with <code>pkill -9</code> so that it cannot leave cleanly. Describe the group every 10 seconds.',
            hint: 'The dead member stays in the list for about 45 seconds. A clean stop, as in the main lab, removes it at once. This is the difference between a crash and a shutdown.' },
          { task: 'Start a group on <code>events</code> with <code>auto.offset.reset=earliest</code> and compare it with the group <code>g-latest</code> from step 1.',
            hint: 'Add <code>--command-property auto.offset.reset=earliest</code> to the console consumer and use a new group name. It reads everything, where <code>g-latest</code> read nothing.' },
          { task: 'Move a group to a point in time. Reset a stopped group with <code>--to-datetime</code> to five minutes ago and describe it.',
            hint: 'The time format is like <code>2026-10-04T23:00:00.000</code>. The new offsets are the first records at or after that time, found through the time index from module 01.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-03', type: 'tf', title: 'Six statements about consumers',
        items: [
          { s: 'Two consumer groups reading one topic each receive every record.', fact: true, why: 'Sharing happens only inside one group.' },
          { s: 'A consumer that sends heartbeats is processing records.', fact: false, why: 'Heartbeats come from a background thread. A stuck processing loop still sends them; the poll interval catches that case.' },
          { s: 'The default <code>auto.offset.reset</code> makes a new group read the topic from the start.', fact: false, why: 'The default is <code>latest</code>: a new group starts at the end.' },
          { s: 'In the new group protocol, the broker decides the assignment.', fact: true, why: 'With <code>group.protocol=consumer</code> the assignment is computed on the broker and sent to each member.' },
          { s: 'A lag of 10,000 records is always a problem.', fact: false, why: 'At 50,000 records each second that is a fifth of a second. Measure lag in time.' },
          { s: 'An empty group keeps its committed offsets for ever.', fact: false, why: 'They are removed after <code>offsets.retention.minutes</code>, 7 days by default.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-slowapi', type: 'design', title: 'A consumer that calls a slow partner',
        prompt: `<p>A consumer must call a partner's HTTP service for each record. A call takes 1 to 3 seconds and sometimes fails for minutes. Peak input is 200 records each second. Records for the same account must be handled in order. No record may be lost, and the partner must not receive the same request twice.</p><p>Design the consumer: parallelism, commits, error handling, and how you avoid duplicates at the partner.</p>`,
        hints: ['200 each second × 2 seconds each = how many calls in progress at once?', 'What do you do with the partition while its records are being processed by workers?', 'What must the partner support for "not twice" to be possible at all?'],
        model: `<p><b>Parallelism.</b> 200 records each second at about 2 seconds each means about 400 calls in progress. One call at a time for each partition would need 400 partitions. So process in a worker pool inside each consumer: one polling thread hands records to workers, and records with the same account always go to the same worker, which keeps the order for each account.</p><p><b>Commits.</b> Turn auto-commit off. Track finished offsets for each partition and commit only the highest offset below which everything is finished. Pause a partition when too many of its records are in progress, and keep calling <code>poll()</code> so that the consumer stays in the group.</p><p><b>Errors.</b> Retry a failed call with growing pauses. If the partner is down, pause all partitions and wait; do not push everything to a dead-letter topic. A record that fails for its own reason goes to a dead-letter topic at once, and later records for that account must wait or be marked, since order matters.</p><p><b>No duplicates at the partner.</b> At-least-once means repeats will happen after a crash. Send a unique request id, built from topic, partition and offset or from the event id, and require the partner to ignore an id it has seen. Without that, "not twice" cannot be guaranteed.</p><p><b>Sizing.</b> Partitions for consumer instances, not for calls: 12 to 24 is enough.</p>`,
        rubric: ['The arithmetic that shows one call per partition is not enough', 'A worker pool that keeps order by account', 'Manual commits of the highest fully finished offset', 'Pause and resume while still polling', 'Different handling for a partner outage and for one bad record', 'A request id that the partner uses to ignore repeats'],
      },
      {
        id: 'ex-rebal', type: 'example', title: 'Ten minutes of duplicates on every release',
        story: `<p>A group of 30 instances reads a 90-partition topic. Each release restarts the instances one by one. During a release, downstream systems see thousands of duplicate records and processing almost stops for ten minutes.</p>`,
        steps: [
          `<b>Count the rebalances.</b> Each instance leaves and joins: 2 rebalances. Thirty instances: 60 rebalances in one release.`,
          `<b>What each one costs.</b> The group used the range strategy of the classic protocol. In every rebalance, all 30 instances gave up all 90 partitions and received a new assignment.`,
          `<b>Where duplicates come from.</b> An instance that gives up a partition has processed records it has not committed yet. The next owner processes them again. Sixty times, across 90 partitions.`,
          `<b>Change one: the protocol.</b> With <code>group.protocol=consumer</code>, only the partitions of the restarting instance move: 3 of 90.`,
          `<b>Change two: static membership.</b> Each instance gets a <code>group.instance.id</code>. A restart shorter than the session timeout is not a rebalance at all.`,
          `<b>Change three: a clean stop.</b> On shutdown the instance finishes its batch, commits, and closes the consumer.`,
          `<b>Result.</b> A release now moves no partitions when restarts are quick, and duplicates dropped to a handful.`,
        ],
        takeaway: `Rebalance cost is the number of rebalances times the partitions each one touches. The new protocol cuts the second number; static membership and clean stops cut the first.`,
      },
    ],

    test: [
      {
        id: 'boss-03', type: 'quizset', title: 'Module 03',
        questions: [
          { q: 'Which pair gives at-least-once delivery?', options: ['Commit, then process', 'Process, then commit', 'Auto-commit with worker threads', 'Never commit'], answer: 1, why: 'A crash between the two repeats records but loses none.' },
          { q: 'A consumer takes 7 minutes to process one batch with default settings. What happens?', options: ['Nothing', 'It is removed from the group after 5 minutes and its batch is repeated elsewhere', 'The broker slows the producers', 'The batch is dropped'], answer: 1, why: '<code>max.poll.interval.ms</code> is 5 minutes. The consumer is judged stuck.' },
          { q: 'Where is the committed offset of a group stored?', options: ['In the consumer\'s memory', 'On the partition leader', 'In the topic <code>__consumer_offsets</code>', 'In the controller\'s metadata log'], answer: 2, why: 'It is a record in a compacted internal topic, managed by the group coordinator.' },
          { q: 'Lag is growing on all partitions at the same rate. What is the likely cause?', options: ['A poison record', 'One hot key', 'The group is slower than the producers', 'A rebalance'], answer: 2, why: 'An even backlog means not enough processing capacity.' },
          { q: 'What does static membership prevent?', options: ['Duplicates in general', 'A rebalance when an instance restarts quickly', 'Lag', 'Poison records'], answer: 1, why: 'The coordinator keeps the member\'s partitions reserved until the session timeout.' },
        ],
      },
    ],
  },
};
