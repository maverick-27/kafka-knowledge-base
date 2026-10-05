// Activities for module 04, Replication.
window.KB_EXTRAS = {
  module: '04',
  sections: {
    summary: [
      {
        id: 'ex-ledger', type: 'example', title: 'Choosing the settings for a ledger topic',
        story: `<p>A bank records every account movement in a topic <code>ledger</code>. The cluster has 6 brokers in 3 zones. The requirement: a movement that was confirmed to the customer must never be lost, and one zone may fail without stopping the bank.</p>`,
        steps: [
          `<b>Copies.</b> Replication factor 3, with <code>broker.rack</code> set to the zone. Each partition then has one replica in each zone.`,
          `<b>What "confirmed" means.</b> Producers use <code>acks=all</code>. But "all" means all <em>in-sync</em> replicas, and that set can shrink to one.`,
          `<b>Close that gap.</b> <code>min.insync.replicas=2</code>. A write is refused unless two brokers have it. With one replica in each zone, a confirmed movement is in two zones.`,
          `<b>Lose a zone.</b> One replica of each partition is gone. Two remain, which meets the minimum. Writes continue.`,
          `<b>Lose a second broker of a partition.</b> One in-sync replica remains. Writes for that partition stop with <code>NOT_ENOUGH_REPLICAS</code>. Reads continue. The bank chose "stop" over "risk a loss".`,
          `<b>Never elect a stale replica.</b> <code>unclean.leader.election.enable=false</code>, the default. A partition with no in-sync replica stays offline until one returns.`,
        ],
        takeaway: `Durability needs four settings together: 3 copies in different zones, <code>acks=all</code>, a minimum of 2, and unclean election off. Remove any one and a confirmed record can be lost.`,
      },
      {
        id: 'q-acksall', type: 'quiz', title: 'How many brokers?',
        q: 'A topic has 3 replicas and <code>min.insync.replicas=1</code>. Two followers have fallen out of sync. A producer writes with <code>acks=all</code> and gets "success". On how many brokers is the record?',
        options: ['3', '2', '1', '0'],
        answer: 2,
        why: 'The in-sync set is the leader alone, and the minimum of 1 allows it. "All" was one broker. This is why the minimum should be 2.',
      },
    ],

    model: [
      {
        id: 'flow-acks', type: 'flow', title: 'One write with acks=all',
        nodes: ['Producer', 'Leader (broker 1)', 'Follower (broker 2)', 'Follower (broker 3)'],
        steps: [
          { from: 0, to: 1, label: 'A', store: [1], chip: 'A', say: 'The producer sends record A. The leader appends it to its log. The high watermark does not move yet, and the producer gets no answer yet.' },
          { from: 2, to: 1, label: 'fetch', say: 'Follower 2 sends its regular fetch request: "give me what comes after my log end".' },
          { from: 1, to: 2, label: 'A', store: [2], chip: 'A', say: 'The leader answers with A. Follower 2 appends it.' },
          { from: 3, to: 1, label: 'fetch', say: 'Follower 3 fetches too.' },
          { from: 1, to: 3, label: 'A', store: [3], chip: 'A', say: 'Follower 3 appends A.' },
          { from: 2, to: 1, label: 'fetch', say: 'The next fetch from follower 2 asks for the offset <em>after</em> A. This is how the leader learns that follower 2 has A.' },
          { from: 3, to: 1, label: 'fetch', say: 'The same from follower 3. Every in-sync replica has A, so the leader moves the high watermark past it. A is committed.' },
          { from: 1, to: 0, label: 'ok', say: 'Now the leader answers the producer. Consumers can read A from this moment.' },
        ],
      },
      {
        id: 'm-repl', type: 'match', title: 'Replication vocabulary',
        pairs: [
          ['In-sync replicas', 'The leader plus the followers that are caught up'],
          ['High watermark', 'The lowest log end offset in the in-sync set'],
          ['Leader epoch', 'A counter that rises at each leader change'],
          ['Preferred leader', 'The first broker in the replica list'],
          ['Unclean election', 'Choosing a leader that was not in sync'],
          ['Truncation', 'A replica cutting its log to match the leader'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-failover', type: 'order', title: 'A leader fails',
        q: 'Click the steps in the order they happen.',
        items: ['The broker stops sending heartbeats to the controller.', 'The controller fences the broker.', 'The controller picks a new leader from the in-sync set and raises the leader epoch.', 'Brokers learn the change from the metadata log.', 'Clients get a "not leader" error, refresh metadata, and continue.'],
        why: 'A clean shutdown skips the wait in the first two steps: the broker asks the controller to move its leaderships before it stops.',
      },
      {
        id: 'flow-trunc', type: 'flow', title: 'An old leader returns',
        nodes: ['Broker 1 (old leader)', 'Controller', 'Broker 2 (new leader)'],
        steps: [
          { at: 0, store: [0, 2], chip: '0–9', say: 'Both brokers hold offsets 0 to 9. Broker 1 leads, in epoch 0.' },
          { at: 0, store: [0], chip: '10, 11', say: 'Broker 1 appends offsets 10 and 11. Broker 2 has not fetched them yet, so they are above the high watermark: not committed, not acknowledged with acks=all.' },
          { at: 0, down: [0], say: 'Broker 1 crashes.' },
          { from: 1, to: 2, label: 'lead, epoch 1', rename: [[2, 'Broker 2 (leader, epoch 1)']], say: 'The controller makes broker 2 the leader, in epoch 1.' },
          { at: 2, store: [2], chip: '10*, 11*', say: 'Producers retry and write new records. On broker 2 they take offsets 10 and 11. They are different records from the ones broker 1 holds at those offsets.' },
          { at: 0, up: [0], rename: [[0, 'Broker 1 (follower)']], say: 'Broker 1 starts again, as a follower.' },
          { from: 0, to: 2, label: 'end of epoch 0?', say: 'Broker 1 asks the leader: "where did epoch 0 end for you?"' },
          { from: 2, to: 0, label: 'offset 10', say: 'The leader answers: epoch 0 ended at offset 10.' },
          { at: 0, clear: [0], store: [0], chip: '0–9', say: 'Broker 1 cuts its log back to offset 10. Its own 10 and 11 are removed. They were never committed, so nothing that was promised is lost.' },
          { from: 2, to: 0, label: '10*, 11*', store: [0], chip: '10*, 11*', say: 'Broker 1 copies the new records from the leader. The two logs are equal again.' },
        ],
      },
      {
        id: 'q-hw', type: 'quiz', title: 'Where is the high watermark?',
        q: 'Log end offsets: leader 10, follower A 8, follower B 9. All three are in sync. Then follower A is removed from the in-sync set. What is the high watermark before and after?',
        options: ['10, then 10', '8, then 9', '9, then 9', '8, then 10'],
        answer: 1,
        why: 'It is the lowest log end offset among in-sync replicas: 8 with all three, 9 when only the leader and B count. Removing a slow follower lets the high watermark move forward.',
      },
    ],

    configs: [
      {
        id: 't-dur', type: 'tune', title: 'Settings for an orders topic',
        goal: 'Requirements: writes must continue with <b>one broker down</b>, and an acknowledged order must survive the <b>permanent loss of one broker</b>.',
        knobs: [
          { id: 'rf', label: 'Replication factor', options: [['1', 1], ['2', 2], ['3', 3]], start: 1 },
          { id: 'min', label: 'min.insync.replicas', options: [['1', 1], ['2', 2], ['3', 3]], start: 0 },
          { id: 'acks', label: 'Producer acks', options: [['1', '1'], ['all', 'all']], start: 0 },
          { id: 'unclean', label: 'Unclean election', options: [['off', false], ['on', true]], start: 0 },
        ],
        run: (v) => {
          if (v.min > v.rf) return { ok: false, html: 'The minimum is larger than the number of replicas. No write with acks=all can ever succeed.' };
          const writes = v.acks === 'all' ? v.rf - v.min >= 1 : v.rf >= 2;
          const safe = v.acks === 'all' && v.min >= 2 && !v.unclean;
          let html = 'Writes with one broker down: <b>' + (writes ? 'yes' : 'no') + '</b>. Acknowledged orders survive losing one broker: <b>' + (safe ? 'yes' : 'no') + '</b>.';
          if (!writes) html += '\n' + (v.rf === 1 ? 'With one replica, a stopped broker stops the partition.' : 'With the minimum equal to the replica count, one stopped broker blocks every acks=all write.');
          if (!safe) {
            if (v.acks !== 'all') html += '\nWith acks=1 the leader answers alone. If it is lost before a follower copies, the order is gone.';
            else if (v.min < 2) html += '\nWith a minimum of 1, the in-sync set can shrink to the leader, and "all" then means one broker.';
            else if (v.unclean) html += '\nUnclean election lets a replica without the order become leader.';
          }
          if (writes && safe) html += '\nThree copies, a minimum of 2, acks=all, unclean election off: the standard, for these reasons.';
          return { ok: writes && safe, html };
        },
      },
      {
        id: 'c-tol', type: 'calc', title: 'How many can fail?',
        q: 'A topic has 5 replicas and <code>min.insync.replicas=3</code>. How many brokers of a partition can be down while writes with <code>acks=all</code> still succeed?',
        unit: 'brokers', answer: 2, tol: 0,
        hint: 'Writes need the minimum number in sync.',
        working: 'Writes need 3 in sync. 5 − 3 = 2 can be down. And an acknowledged record is on at least 3 brokers, so it survives the permanent loss of 2.',
      },
    ],

    failures: [
      {
        id: 's-offline', type: 'scenario', title: 'A partition with no leader, and a manager on the phone',
        intro: 'Partition 4 of <code>payments</code> shows <code>Leader: none</code>, <code>Isr:</code> empty, <code>Elr: 2</code>. Replicas are brokers 2 and 5. Broker 2 crashed twenty minutes ago. Broker 5 is running. Payments for a twelfth of your customers are failing.',
        steps: [
          { situation: 'Broker 5 is up. Why is it not the leader, and what does that tell you?',
            choices: [
              { label: 'Broker 5 was not in sync when broker 2 failed. It lacks some committed records. <code>Elr: 2</code> names the broker that has them all.', good: true, result: 'Right. Broker 5 had fallen behind earlier in the day. Broker 2 was the last in-sync replica.' },
              { label: 'It is a bug. Restart broker 5 to make it take over.', good: false, result: 'It restarts and still does not lead. The controller is refusing on purpose.' },
            ] },
          { situation: 'A manager asks you to "just make it work now". What do you say you need to know first?',
            choices: [
              { label: 'How long until broker 2 is back, and whether its disk is intact.', good: true, result: 'Broker 2 had a kernel panic. Its disks are fine. A restart takes about five minutes.' },
              { label: 'Nothing. Force the unclean election at once.', good: false, result: 'Broker 5 becomes leader without the records it missed. Payments that customers were told succeeded no longer exist in the topic, and broker 2 will delete its copies of them when it returns.' },
            ] },
          { situation: 'Broker 2 can be back in five minutes with all its data. What do you do?',
            choices: [
              { label: 'Wait for broker 2. Tell the manager: five more minutes of outage, no data loss.', good: true, result: 'Broker 2 starts, the controller elects it at once from the eligible list, broker 5 catches up. Nothing was lost.' },
              { label: 'Force the unclean election anyway, to save five minutes.', good: false, result: 'You traded five minutes for a permanent loss and a reconciliation project with the finance team.' },
            ] },
          { situation: 'Imagine instead that broker 2\'s disk was destroyed. What changes?',
            choices: [
              { label: 'The records only it had are gone in any case. Electing broker 5 uncleanly is now right, and you record the offsets lost.', good: true, result: 'Correct. Waiting would not bring the data back. You note the last offset broker 5 has, so that the gap can be reconciled from the source systems.' },
              { label: 'Keep the partition offline until someone recovers the disk.', good: false, result: 'The disk is not recoverable. You extend the outage with no benefit.' },
            ] },
        ],
        debrief: 'The question in an unclean-election decision is never "availability or consistency" in general. It is: does the missing replica still have its data, and how long until it is back?',
      },
    ],

    lab: [
      {
        id: 'lab-04', type: 'lab', title: 'Four more experiments',
        intro: '<p>Run these with all three brokers up at the start.</p>',
        tasks: [
          { task: 'Compare a clean stop with a crash. Stop the leader of a partition with <code>docker stop</code>, then repeat with <code>docker kill</code>, and time how long the partition has the old leader in each case.',
            hint: '<code>docker stop</code> lets the broker hand over leadership first: almost no gap. <code>docker kill</code> gives no warning, so the controller waits for the missed heartbeats, up to 9 seconds.' },
          { task: 'Watch a follower catch up. Stop a follower, write 300,000 records with the performance tool, start the follower, and describe the topic every few seconds.',
            hint: 'The broker reappears in <code>Replicas</code> at once but joins <code>Isr</code> only when it has copied everything.' },
          { task: 'Cause leader imbalance and repair it. Restart one broker and count how many partitions each broker leads before and after a preferred election for all partitions.',
            hint: 'After the restart, the restarted broker leads nothing. <code>kafka-leader-election.sh --election-type preferred --all-topic-partitions</code> restores the balance.' },
          { task: 'List every topic on the cluster whose settings would not survive a broker loss.',
            hint: 'Describe all topics and look for a replication factor below 3 or a minimum of 1. The lab cluster has several, created by earlier labs on purpose.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-04', type: 'tf', title: 'Six statements about replication',
        items: [
          { s: 'A follower is removed from the in-sync set when it is more than 4,000 records behind.', fact: false, why: 'The rule is time: not caught up for <code>replica.lag.time.max.ms</code>, 30 seconds.' },
          { s: 'Consumers cannot read a record until every in-sync replica has it.', fact: true, why: 'They read only below the high watermark.' },
          { s: 'Replication protects against an operator deleting the wrong topic.', fact: false, why: 'A delete is copied like everything else. Replication is not a backup.' },
          { s: 'A replica that truncates its log has always lost committed data.', fact: false, why: 'Cutting records above the high watermark is normal after a leader change. Only truncation below it is loss.' },
          { s: 'Setting the minimum equal to the replication factor gives the best availability.', fact: false, why: 'It gives the worst: one stopped broker blocks writes.' },
          { s: 'Kafka decides committed records by the in-sync set, not by a majority vote.', fact: true, why: 'Majority voting is used only for the cluster metadata.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-zones', type: 'design', title: 'Lay out a cluster over three zones',
        prompt: `<p>You are building a cluster in one cloud region with three zones. It carries order and payment events. Requirements: survive the loss of one zone with no lost acknowledged record and with writes continuing; allow rolling restarts during business hours; keep cross-zone network cost reasonable.</p><p>Give the broker count and placement, the topic and producer settings, and what happens in each failure.</p>`,
        hints: ['How many brokers must be in each zone so that losing a zone leaves enough capacity?', 'During a rolling restart, one broker is down on purpose. What if a zone fails at that moment?', 'Which traffic crosses zones: writes, replication, reads?'],
        model: `<p><b>Brokers.</b> A multiple of three, at least 6: two in each zone. Set <code>broker.rack</code> to the zone so that the three replicas of each partition are in three zones. Size so that four brokers can carry the load, because a zone loss removes a third of the capacity.</p><p><b>Controllers.</b> Three dedicated controllers, one in each zone. Any zone can fail and a majority remains.</p><p><b>Topics and producers.</b> 3 copies, <code>min.insync.replicas=2</code>, <code>acks=all</code>, unclean election off.</p><p><b>Zone loss.</b> Each partition loses one replica and keeps two in sync. Leaders in the lost zone move within seconds. Writes continue and nothing acknowledged is lost.</p><p><b>Zone loss during a rolling restart.</b> Partitions whose other replica was on the restarting broker have one in-sync replica. Writes to those stop until the restarting broker returns, a few minutes. Nothing is lost. To avoid even this, use 5 copies with a minimum of 3 for the most critical topics, or pause restarts when a zone is unhealthy.</p><p><b>Cost.</b> Every write is copied to two other zones; that is the price of the guarantee. Reads can stay in the zone: set <code>client.rack</code> on consumers and the rack-aware replica selector on brokers.</p>`,
        rubric: ['Brokers spread evenly over the zones with broker.rack set', 'Capacity sized for the loss of a whole zone', 'Three controllers, one in each zone', '3 copies, minimum 2, acks=all, unclean election off', 'The case of a zone failure during a restart, and what it costs', 'Reading from a follower in the same zone to cut cost'],
      },
      {
        id: 'ex-rf2', type: 'example', title: 'Why two copies are a trap',
        story: `<p>A team runs a topic with 2 replicas "to save disk". They ask what <code>min.insync.replicas</code> should be. Work through both choices.</p>`,
        steps: [
          `<b>Minimum 1.</b> With one broker down, the remaining leader accepts writes alone.`,
          `<b>The risk.</b> Those writes exist on one broker. If that broker's disk fails before the other returns and catches up, acknowledged records are gone.`,
          `<b>When is one broker down?</b> During every rolling restart, on purpose, for minutes. So this risk is taken at every upgrade and every configuration change.`,
          `<b>Minimum 2.</b> Now a write needs both replicas. With one broker down, writes stop.`,
          `<b>The cost.</b> Every rolling restart is now a write outage for the partitions on the restarting broker.`,
          `<b>Conclusion.</b> With 2 replicas you must choose between losing data and losing availability at every restart. With 3 replicas and a minimum of 2, you get both.`,
          `<b>The price of the third copy.</b> 50% more disk than two copies. Compare that with the cost of one lost-data incident.`,
        ],
        takeaway: `Two copies cannot give both safe writes and writes during maintenance. Three is the smallest number that can, which is why it is the standard and not a luxury.`,
      },
    ],

    test: [
      {
        id: 'boss-04', type: 'quizset', title: 'Module 04',
        questions: [
          { q: 'Which replicas may become leader in a clean election?', options: ['Any replica', 'Only in-sync replicas, or eligible leader replicas', 'Only the preferred leader', 'The replica with the newest timestamp'], answer: 1, why: 'Only replicas known to hold every committed record.' },
          { q: 'A follower is 20 seconds behind and steady. Is it in the in-sync set?', options: ['Yes', 'No', 'Only if it is the preferred leader', 'Only with acks=1'], answer: 0, why: 'It leaves only after not catching up for 30 seconds.' },
          { q: 'What does the leader epoch allow a returning replica to do?', options: ['Become leader faster', 'Find where its log may differ from the leader\'s and cut it there', 'Skip the copy of missing records', 'Vote in an election'], answer: 1, why: 'It asks where each epoch ended and truncates what does not match.' },
          { q: '3 replicas, minimum 2, one broker down. What is true?', options: ['Writes with acks=all fail', 'Writes continue; protection is reduced', 'Consumers cannot read', 'The partition is offline'], answer: 1, why: 'Two in-sync replicas meet the minimum. The partition is under-replicated but fully working.' },
          { q: 'What is lost in an unclean leader election?', options: ['Nothing', 'Consumer offsets only', 'Every record the new leader did not have, including committed ones', 'Only records above the high watermark'], answer: 2, why: 'In the lab the end offset went from 20 back to 10.' },
        ],
      },
    ],
  },
};
