// Activities for module 05, KRaft and the controller.
window.KB_EXTRAS = {
  module: '05',
  sections: {
    summary: [
      {
        id: 'ex-three', type: 'example', title: 'How many controllers does a new cluster need?',
        story: `<p>A team sets up its first production cluster: 9 brokers in 3 zones. Someone proposes 2 controllers "for redundancy". Someone else proposes making all 9 brokers controllers too. Work out the right answer.</p>`,
        steps: [
          `<b>Two controllers.</b> A majority of 2 is 2. If either one stops, no majority exists. Two controllers survive zero failures, the same as one, with twice the things that can break.`,
          `<b>Three controllers.</b> A majority is 2. One can fail. Place one in each zone, and any single zone can be lost.`,
          `<b>Four controllers.</b> A majority is 3. Still only one can fail. The fourth adds cost and no safety.`,
          `<b>Five controllers.</b> A majority is 3. Two can fail. This is for clusters that must survive a failure while another controller is down for maintenance.`,
          `<b>Nine combined brokers.</b> Every metadata record must reach 5 of 9 before it counts, so decisions get slower. And each busy broker can disturb the quorum. More voters is not more safety.`,
          `<b>The decision.</b> Three dedicated controllers, small machines, one in each zone. Revisit at five if maintenance windows and failures start to overlap.`,
        ],
        takeaway: `Count failures survived, not servers. That number is (controllers − 1) ÷ 2, rounded down. Odd numbers only, and separate from the brokers.`,
      },
      {
        id: 'q-traffic', type: 'quiz', title: 'Who talks to the controller?',
        q: 'A producer sends a record to a topic. Which servers does that request touch?',
        options: ['The active controller, then the partition leader', 'Only the partition leader, and through it the followers', 'All controllers', 'Any broker, which forwards it to the controller'],
        answer: 1,
        why: 'Clients talk only to brokers. The controller handles metadata, not records. This is why client traffic continues during a controller election.',
      },
    ],

    model: [
      {
        id: 'flow-elect', type: 'flow', title: 'The active controller fails',
        nodes: ['Controller 1', 'Controller 2', 'Controller 3'],
        steps: [
          { at: 0, rename: [[0, 'Controller 1 (active, epoch 3)']], say: 'Controller 1 is the active controller in epoch 3. Controllers 2 and 3 fetch from it all the time.' },
          { at: 0, down: [0], say: 'Controller 1 stops.' },
          { at: 1, say: 'Controller 2 gets no answer to its fetch for 2 seconds: <code>controller.quorum.fetch.timeout.ms</code>.' },
          { from: 1, to: 2, label: 'would you vote?', say: 'Before it disturbs anything, controller 2 asks: "would you vote for me?" This check avoids pointless elections when only its own network is slow.' },
          { from: 2, to: 1, label: 'yes', say: 'Controller 3 has also lost the leader, and controller 2\'s log is as complete as its own. It says yes.' },
          { from: 1, to: 2, label: 'vote, epoch 4', say: 'Controller 2 starts epoch 4 and asks for a real vote.' },
          { from: 2, to: 1, label: 'granted', say: 'Controller 3 grants it and writes its vote to disk, so that it cannot vote for anyone else in epoch 4.' },
          { at: 1, rename: [[1, 'Controller 2 (active, epoch 4)']], say: 'Two votes of three: a majority. Controller 2 is the active controller. In the lab this took about one second.' },
          { from: 2, to: 1, label: 'fetch', say: 'Controller 3 now fetches from controller 2. Brokers find the new leader and continue.' },
        ],
      },
      {
        id: 'm-records', type: 'match', title: 'What each metadata record means',
        pairs: [
          ['TOPIC_RECORD', 'A topic was created'],
          ['PARTITION_RECORD', 'A partition was created with its replicas and leader'],
          ['PARTITION_CHANGE_RECORD', 'A partition\'s leader or in-sync set changed'],
          ['REGISTER_BROKER_RECORD', 'A broker started and registered'],
          ['CONFIG_RECORD', 'A topic or broker setting changed'],
          ['NO_OP_RECORD', 'Nothing happened; the log is still alive'],
        ],
        why: 'All of these were in the lab cluster\'s metadata log. The current state of the cluster is these records, replayed in order.',
      },
    ],

    internals: [
      {
        id: 'o-start', type: 'order', title: 'A broker starts',
        q: 'Click the steps in order.',
        items: ['Read meta.properties and check the cluster id and node id.', 'Register with the active controller and receive a broker epoch.', 'Fetch and replay the metadata log.', 'The controller unfences the broker.', 'The broker becomes leader or follower for its partitions.'],
        why: 'Until the fourth step the broker is fenced: registered, but not allowed to lead anything.',
      },
      {
        id: 'flow-create', type: 'flow', title: 'Creating a topic',
        nodes: ['Admin tool', 'A broker', 'Active controller', 'Other controllers', 'All brokers'],
        steps: [
          { from: 0, to: 1, label: 'create orders', say: 'The tool sends "create topic orders, 3 partitions, 3 copies" to any broker.' },
          { from: 1, to: 2, label: 'create orders', say: 'The broker forwards the request to the active controller. Only it may change metadata.' },
          { at: 2, say: 'The controller checks the request and decides the placement: which brokers hold each replica, and who leads.' },
          { at: 2, store: [2], chip: 'topic + 3 partitions', say: 'It appends a topic record and three partition records to the metadata log.' },
          { from: 3, to: 2, label: 'fetch', say: 'The other controllers fetch the new records.' },
          { at: 3, store: [3], chip: 'topic + 3 partitions', say: 'When a majority of controllers has the records, they are committed.' },
          { from: 2, to: 1, label: 'ok', say: 'The controller answers the broker, and the broker answers the tool: "Created topic orders."' },
          { from: 4, to: 2, label: 'fetch', say: 'Every broker fetches the metadata log too.' },
          { at: 4, store: [4], chip: 'topic + 3 partitions', say: 'Each broker replays the records. The ones named as replicas create their log directories and start as leader or follower.' },
        ],
      },
      {
        id: 'q-maj', type: 'quiz', title: 'Two of five',
        q: 'A quorum has 5 controllers. Two are down for a failed upgrade. A third has a network fault and cannot reach the others. What can the cluster do?',
        options: ['Everything; brokers do not need controllers', 'Serve existing partitions, but change no metadata', 'Nothing at all', 'Elect a new leader among the two that can talk'],
        answer: 1,
        why: 'Two controllers that can talk are not a majority of five. No election, no topic creation, no leader change. Existing leaders keep serving until one of them fails.',
      },
    ],

    configs: [
      {
        id: 't-place', type: 'tune', title: 'Place the controllers',
        goal: 'A region has zones A, B and C. Requirement: metadata changes must continue when <b>any one zone</b> is lost. Use as few controllers as possible.',
        knobs: [
          { id: 'a', label: 'Controllers in zone A', options: [['0', 0], ['1', 1], ['2', 2], ['3', 3]], start: 3 },
          { id: 'b', label: 'Zone B', options: [['0', 0], ['1', 1], ['2', 2]], start: 0 },
          { id: 'c', label: 'Zone C', options: [['0', 0], ['1', 1], ['2', 2]], start: 0 },
        ],
        run: (v) => {
          const n = v.a + v.b + v.c;
          if (n === 0) return { ok: false, html: 'A cluster needs at least one controller.' };
          const need = Math.floor(n / 2) + 1;
          const worst = Math.max(v.a, v.b, v.c), left = n - worst;
          const ok = left >= need, minimal = n === 3;
          let html = n + ' controllers; a majority is ' + need + '. The largest zone holds ' + worst + '. If it is lost, ' + left + ' remain: <b>' + (ok ? 'a majority' : 'no majority') + '</b>.';
          if (!ok) html += '\nOne zone holds too many voters. Losing it stops all metadata changes.';
          else if (!minimal) html += '\nThis survives a zone, but it uses ' + n + ' controllers. Three, one in each zone, do the same.';
          else html += '\nOne in each zone: the smallest layout that survives any single zone.';
          return { ok: ok && minimal, html };
        },
      },
      {
        id: 'c-maj', type: 'calc', title: 'Majority',
        q: 'A quorum has 7 controllers. How many must be running and able to talk to each other for metadata to change?',
        unit: 'controllers', answer: 4, tol: 0,
        hint: 'More than half.',
        working: 'Half of 7 is 3.5, so a majority is 4. Three can fail. Compare with 5 controllers: a majority of 3, two can fail.',
      },
    ],

    failures: [
      {
        id: 's-quorum', type: 'scenario', title: 'Topic creation hangs',
        intro: 'A deployment pipeline reports that <code>kafka-topics.sh --create</code> has been hanging for five minutes. Producers and consumers of existing topics seem fine. The cluster has 3 controllers.',
        steps: [
          { situation: 'Existing traffic works but a metadata change hangs. What do you suspect and check?',
            choices: [
              { label: 'The controller quorum. Check which controller processes are running and try <code>kafka-metadata-quorum.sh describe --status</code>.', good: true, result: 'The status command hangs too. Controller 1 is running. Controllers 2 and 3 are not: a configuration change was rolled to both at the same time and they failed to start.' },
              { label: 'The brokers are overloaded. Restart them one by one.', good: false, result: 'With no active controller, a restarted broker cannot register or be unfenced. Each restart removes a working broker for good, until the quorum returns.' },
              { label: 'Run the create command again several times.', good: false, result: 'It hangs each time. Nothing can accept it.' },
            ] },
          { situation: 'One of three controllers is running. What is the state of the cluster right now?',
            choices: [
              { label: 'Existing leaders serve traffic. But if any broker fails now, its partitions get no new leader.', good: true, result: 'Correct, and that makes this urgent although nothing looks broken yet.' },
              { label: 'The remaining controller has taken over as the only voter.', good: false, result: 'One of three is not a majority. It cannot elect itself. Its log says "Election timed out before receiving sufficient vote responses".' },
            ] },
          { situation: 'Controllers 2 and 3 fail at start because of a typing error in the new configuration. What do you do?',
            choices: [
              { label: 'Fix the configuration on one of them, start it, and confirm a leader is elected. Then fix the other.', good: true, result: 'Controller 2 starts. Two of three is a majority; a leader is elected in a second. The hanging create command completes. Then you repair controller 3.' },
              { label: 'Delete the metadata directory on controllers 2 and 3 so that they start clean.', good: false, result: 'You have destroyed two of the three copies of the cluster\'s metadata and their voting history. This can end with a cluster that has forgotten its topics.' },
              { label: 'Reformat all three controllers with a new cluster id.', good: false, result: 'The brokers belong to the old cluster id and refuse to join. Every topic\'s metadata is gone.' },
            ] },
          { situation: 'What rule would have prevented this?',
            choices: [
              { label: 'Change one controller at a time, and check the quorum status between each.', good: true, result: 'The rollout tool now refuses to touch a second controller until the first has rejoined with zero lag.' },
              { label: 'Never change controller configuration.', good: false, result: 'Not possible; upgrades and security changes need it. The answer is a safe procedure.' },
            ] },
        ],
        debrief: 'Losing the quorum is quiet: data keeps flowing while the cluster can no longer heal itself. Monitor "is there exactly one active controller" directly, and roll controllers one at a time.',
      },
    ],

    lab: [
      {
        id: 'lab-05', type: 'lab', title: 'Four more experiments',
        intro: '<p>Use the three-node lab cluster. Remember that each node is both broker and controller.</p>',
        tasks: [
          { task: 'Watch the metadata log grow. Read <code>HighWatermark</code> from the quorum status, wait 10 seconds, and read it again.',
            hint: 'It rises by about 20: one no-op record every 500 milliseconds, even when nothing happens.' },
          { task: 'Find the records for one action. Note the high watermark, create a topic with 2 partitions, and dump the metadata log from that point.',
            hint: 'You should find one <code>TOPIC_RECORD</code> and two <code>PARTITION_RECORD</code> entries, each with replicas, in-sync set and leader.' },
          { task: 'See a broker fenced. Stop one node with <code>docker kill</code> and run <code>kafka-broker-api-versions.sh</code> from another node a few times.',
            hint: 'The stopped broker disappears from the list after the session timeout of 9 seconds. Its partitions show new leaders at the same moment.' },
          { task: 'Count the epochs. Read <code>LeaderEpoch</code> in the quorum status, stop the active controller, start it again, and read the value.',
            hint: 'It rises by at least one for each election. A rising number on a quiet cluster means the quorum is unstable.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-05', type: 'tf', title: 'Six statements about KRaft',
        items: [
          { s: 'A Kafka 4 cluster needs ZooKeeper.', fact: false, why: 'ZooKeeper was removed in Kafka 4.0. Metadata lives in the controller quorum.' },
          { s: 'Four controllers survive more failures than three.', fact: false, why: 'Both survive one. A majority of four is three.' },
          { s: 'If no controller is active, existing partition leaders keep serving clients.', fact: true, why: 'They do, with the metadata they have. What stops is every change, including replacing a failed leader.' },
          { s: 'A metadata record counts when the active controller has written it.', fact: false, why: 'It counts when a majority of controllers has it.' },
          { s: 'Brokers copy the metadata log but do not vote.', fact: true, why: 'They are observers. Only controllers vote.' },
          { s: 'Installing new software on every server finishes an upgrade.', fact: false, why: 'New formats start only when you raise <code>metadata.version</code>, as a separate step.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-ctl', type: 'design', title: 'Controllers for a large cluster',
        prompt: `<p>You run a cluster of 60 brokers and about 150,000 partitions in three zones. It currently uses 3 nodes in combined mode as controllers, inherited from a pilot. You have seen controller elections during traffic peaks. Propose the target layout, the migration, and what you will monitor.</p>`,
        hints: ['Why do elections happen at traffic peaks in combined mode?', 'How do you move the controller role without losing the quorum?', 'What does a broker failure cost the controller at 150,000 partitions?'],
        model: `<p><b>Cause.</b> In combined mode the controller shares a process with a busy broker. At peak, pauses and disk waits make it miss the 2-second fetch deadline, and the others start an election.</p><p><b>Target.</b> Three dedicated controller servers, one in each zone, with fast disks for the metadata log and nothing else running on them. Consider five if you want to survive a failure during maintenance.</p><p><b>Migration.</b> Never lose the majority. Add the new controllers and remove the old ones one at a time, checking quorum status and follower lag after each step. With a fixed voter list this means careful, staged configuration changes and restarts; with the changeable quorum it is an add and a remove for each controller. Rehearse on a test cluster first, and read the documentation for your exact version: I have not run this migration.</p><p><b>Scale.</b> When a broker fails, the controller writes a change record for every partition that broker touched: about 7,500 here. Keep this in mind for failover time, and resist growing partition counts without need.</p><p><b>Monitor.</b> Exactly one active controller. The quorum's leader epoch, which should not rise. Each voter's lag. Metadata log disk latency. The count of fenced brokers.</p>`,
        rubric: ['The reason combined mode causes elections under load', 'Dedicated controllers, an odd number, spread over zones', 'A migration that changes one voter at a time and checks the quorum', 'A statement that the procedure must be rehearsed and checked against the version\'s documentation', 'The cost of a broker failure in partition change records', 'Monitoring of active controller count, epoch and voter lag'],
      },
      {
        id: 'ex-status', type: 'example', title: 'Reading a quorum status like a doctor',
        story: `<p>You are handed this output from a production cluster and asked "is it healthy?"</p><pre class="out">LeaderId:              2
LeaderEpoch:           187
HighWatermark:         9841220
MaxFollowerLag:        31450
MaxFollowerLagTimeMs:  15200
CurrentVoters:         1, 2, 3</pre>`,
        steps: [
          `<b>LeaderId 2.</b> There is an active controller. Good.`,
          `<b>LeaderEpoch 187.</b> Each election uses at least one epoch. The lab cluster was at 6 after an afternoon of deliberate failures. 187 means this quorum has held many elections. Ask how old the cluster is; if it is weeks, not years, the quorum is unstable.`,
          `<b>MaxFollowerLag 31,450 records, 15 seconds.</b> One voter is far behind the leader. In a healthy quorum this is near zero.`,
          `<b>What that means.</b> Only two voters are really current. If either fails now, the lagging one must catch up before a majority can commit anything.`,
          `<b>Next command.</b> <code>describe --replication</code> shows each voter's lag and last fetch time, which tells you which controller is behind.`,
          `<b>Likely causes.</b> A slow disk under the metadata log on that controller, a network problem to it, or, in combined mode, a broker that is overloaded.`,
        ],
        takeaway: `"There is a leader" is not "healthy". Read the epoch as a count of past trouble and the follower lag as your current margin of safety.`,
      },
    ],

    test: [
      {
        id: 'boss-05', type: 'quizset', title: 'Module 05',
        questions: [
          { q: 'What is the active controller?', options: ['The broker with the most partitions', 'The elected leader of the controller quorum', 'Any controller that is running', 'The first node in the voter list'], answer: 1, why: 'One controller is elected leader of the quorum and makes all metadata decisions.' },
          { q: 'How many failures does a 3-controller quorum survive?', options: ['0', '1', '2', '3'], answer: 1, why: 'Two of three form a majority.' },
          { q: 'Why does a voter refuse a candidate whose log is shorter than its own?', options: ['To save time', 'So that the winner always has every committed record', 'Because of the node id order', 'It does not refuse'], answer: 1, why: 'A committed record is on a majority, and a majority must vote for the winner.' },
          { q: 'A broker is running but cut off from the controllers. What does the controller do after 9 seconds?', options: ['Nothing', 'Fences it and elects new leaders for its partitions', 'Deletes its data', 'Restarts it'], answer: 1, why: 'A fenced broker may not lead or count as in sync.' },
          { q: 'What is combined mode suitable for?', options: ['Large production clusters', 'Development and tests', 'Multi-region clusters', 'Nothing'], answer: 1, why: 'It ties the quorum\'s health to broker load.' },
        ],
      },
    ],
  },
};
