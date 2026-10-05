// Activities for module 12, Monitoring lab.
window.KB_EXTRAS = {
  module: '12',
  sections: {
    summary: [
      {
        id: 'ex-quiet', type: 'example', title: 'Nine days of warning that nobody saw',
        story: `<p>A cluster had an outage on a Friday: a broker failed, and writes to forty topics stopped. The cluster had three copies and a minimum of 2, so one broker failure should not stop anything. The review looked at what the metrics had said before.</p>`,
        steps: [
          `<b>Nine days earlier.</b> Under-replicated partitions rose from 0 to 212 and stayed there. Broker 5's disk had become slow and it had fallen out of most in-sync sets.`,
          `<b>Why nobody acted.</b> The number was on a dashboard. There was no alert on it, and nothing was failing.`,
          `<b>What that state meant.</b> For 212 partitions, only two of three replicas were in sync. The cluster had no spare protection for them.`,
          `<b>Friday.</b> Broker 2 failed for an unrelated reason. Those partitions that had replicas on brokers 2 and 5 dropped to one in-sync replica: below the minimum. Writes were refused.`,
          `<b>The fix on the day.</b> Bring broker 2 back. Twenty minutes of outage.`,
          `<b>The real fix.</b> A ticket-level alert when under-replicated partitions stays above 0 for 15 minutes. It would have fired nine days before the outage.`,
          `<b>And a second one.</b> An alert on in-sync set shrink rate with no broker down, which points at a struggling broker directly.`,
        ],
        takeaway: `Outages in Kafka usually need two faults. The first one is silent unless you alert on lost redundancy. That alert buys you the days between the first fault and the second.`,
      },
      {
        id: 'q-level', type: 'quiz', title: 'Page or ticket?',
        q: 'It is 03:00. One of six brokers has stopped. Topics have three copies and a minimum of 2. Offline partitions and partitions below the minimum are both 0. What is the right response?',
        options: ['Page the on-call engineer.', 'A ticket for the morning; nothing is failing.', 'Ignore it; Kafka heals itself.', 'Restart the other brokers to rebalance.'],
        answer: 1,
        why: 'Redundancy is reduced, not availability. It must be fixed within hours, and it does not need to wake anyone. If a second broker fails, the page-level alert fires.',
      },
    ],
    model: [
      {
        id: 'flow-alert', type: 'flow', title: 'From a stopped broker to a fired alert',
        nodes: ['Broker 3', 'Cluster', 'Exporter', 'Prometheus', 'On-call'],
        steps: [
          { at: 0, down: [0], say: 'Broker 3 stops.' },
          { at: 1, say: 'After the session timeout the controller fences it. Leaders move, and in-sync sets shrink to two.' },
          { from: 2, to: 1, label: 'metadata?', say: 'The exporter, connected as a client, asks the cluster about brokers and partitions.' },
          { from: 1, to: 2, label: '2 brokers', store: [2], chip: 'brokers=2', say: 'It now sees 2 brokers and 57 partitions with fewer in-sync replicas than replicas.' },
          { from: 3, to: 2, label: 'scrape', say: 'Every 5 seconds Prometheus reads the exporter\'s numbers.' },
          { at: 3, store: [3], chip: 'pending', say: 'The rule <code>kafka_brokers &lt; 3</code> is true. The alert is "pending": the condition must hold for 15 seconds first.' },
          { at: 3, clear: [3], store: [3], chip: 'FIRING', say: 'Fifteen seconds later it still holds. The alert fires. A restart that takes 10 seconds would never have reached this point.' },
          { from: 3, to: 4, label: 'KafkaBrokerDown', say: 'The alert is routed by its severity label. In the lab this took under 50 seconds from the stop.' },
        ],
      },
      {
        id: 'm-metrics', type: 'match', title: 'Metric names and meanings',
        pairs: [
          ['OfflinePartitionsCount', 'Partitions with no leader'],
          ['UnderReplicatedPartitions', 'Fewer in-sync replicas than replicas, for partitions this broker leads'],
          ['UnderMinIsrPartitionCount', 'Below the in-sync minimum; acks=all writes are refused'],
          ['ActiveControllerCount', '1 on the active controller, 0 elsewhere'],
          ['RequestHandlerAvgIdlePercent', 'Share of time request threads are idle'],
          ['IsrShrinksPerSec', 'How often in-sync sets get smaller'],
        ],
        why: 'All six names were read from a lab broker.',
      },
    ],
    internals: [
      {
        id: 'q-sum', type: 'quiz', title: 'One node says zero',
        q: 'On controller node 1, <code>ActiveControllerCount</code> is 0. What do you conclude?',
        options: ['The cluster has no active controller. Emergency.', 'Nothing yet. Read the others and add them up.', 'Node 1 is broken.', 'The metric is wrong.'],
        answer: 1,
        why: 'The value is 1 on the active controller and 0 on the rest. In the lab node 1 read 0 while node 2 was the leader. Alert when the sum is not exactly 1.',
      },
      {
        id: 'o-alert', type: 'order', title: 'Build an alert properly',
        q: 'Click the steps in order.',
        items: ['Decide what the condition means for clients.', 'Choose the metric and write the expression.', 'Set a "for" time longer than a normal restart.', 'Give it a severity: page or ticket.', 'Cause the fault on a test cluster and watch it fire.', 'Write what the person who receives it should do.'],
        why: 'The fifth step is the one that is skipped. An untested alert is a guess.',
      },
    ],
    configs: [
      {
        id: 't-alert', type: 'tune', title: 'Tune one alert',
        goal: 'The alert is "under-replicated partitions above 0". A rolling restart leaves partitions under-replicated for about <b>2 minutes</b> for each broker. The alert must <b>not fire during a normal restart</b>, must fire <b>within 20 minutes</b> of a real problem, and must <b>not wake anyone at night</b>.',
        knobs: [
          { id: 'forT', label: 'for', options: [['0 seconds', 0], ['30 seconds', 0.5], ['10 minutes', 10], ['2 hours', 120]], start: 0 },
          { id: 'sev', label: 'severity', options: [['page', 'page'], ['ticket', 'ticket']], start: 0 },
        ],
        run: (v) => {
          const quiet = v.forT > 2, quick = v.forT <= 20, calm = v.sev === 'ticket';
          let html = 'Silent during a restart: <b>' + (quiet ? 'yes' : 'no') + '</b>. Fires within 20 minutes: <b>' + (quick ? 'yes' : 'no') + '</b>. Lets people sleep: <b>' + (calm ? 'yes' : 'no') + '</b>.';
          if (!quiet) html += '\nEvery broker restart fires it. After a month people stop reading it.';
          if (!quick) html += '\nTwo hours with reduced protection before anyone knows.';
          if (!calm) html += '\nThis condition means redundancy is lost, not availability. It should not page.';
          return { ok: quiet && quick && calm, html };
        },
      },
      {
        id: 'c-full', type: 'calc', title: 'When is the disk full?',
        q: 'A broker disk of 4,000 GB holds 2,800 GB. Over the last six hours it grew by 30 GB each hour. If nothing changes, in how many hours is it full?',
        unit: 'hours', answer: 40, tol: 0.03,
        hint: 'Free space divided by growth each hour.',
        working: '4,000 − 2,800 = 1,200 GB free. 1,200 ÷ 30 = 40 hours. The disk is at 70%, which a level alert at 80% would call fine. A prediction alert says "less than two days".',
      },
    ],
    failures: [
      {
        id: 's-blind', type: 'scenario', title: 'The dashboards go blank during an upgrade',
        intro: 'You are halfway through a rolling upgrade to a new Kafka version. The consumer lag panels on every dashboard show "no data". Application teams are asking if their consumers are dead.',
        steps: [
          { situation: 'What do you check first?',
            choices: [
              { label: 'The consumers themselves, with <code>kafka-consumer-groups.sh --describe</code>.', good: true, result: 'Every group has members and its lag is small. The consumers are fine. The monitoring is what broke.' },
              { label: 'Roll the upgrade back at once.', good: false, result: 'A rollback in the middle of an upgrade is a second risky change, made without knowing what is wrong.' },
              { label: 'Restart all consumer applications.', good: false, result: 'You cause a rebalance in every group for nothing.' },
            ] },
          { situation: 'The exporter\'s log repeats "Cannot get consumer group". Its other metrics work. What does that tell you?',
            choices: [
              { label: 'The exporter cannot make its group request against the new brokers. A compatibility problem in the monitoring tool.', good: true, result: 'The same thing happened in this lab with Kafka 4.3.' },
              { label: 'The brokers have lost the consumer groups.', good: false, result: 'The command-line tool reads them without trouble.' },
            ] },
          { situation: 'You are blind on lag for the rest of the upgrade. How do you continue safely?',
            choices: [
              { label: 'Pause, set up a temporary lag check from the command-line tool for the critical groups, then continue.', good: true, result: 'A small script that runs the describe command each minute and alerts on its output covers the gap.' },
              { label: 'Continue; the consumers were fine a minute ago.', good: false, result: 'You are now changing brokers with no way to see if a consumer falls behind.' },
            ] },
          { situation: 'What changes for the next upgrade?',
            choices: [
              { label: 'Test the whole monitoring stack against the new version first, and add an alert for missing metrics.', good: true, result: 'The exporter problem would have been found on a test cluster a week earlier.' },
              { label: 'Stop monitoring lag.', good: false, result: 'Lag is the signal application teams need most.' },
            ] },
        ],
        debrief: 'Your monitoring is a client of the cluster and can break with it. Always keep one check that needs no extra tooling, and make "no data" an alert of its own.',
      },
    ],
    lab: [
      {
        id: 'lab-12', type: 'lab', title: 'Four more experiments',
        intro: '<p>Run these with the monitoring profile started.</p>',
        tasks: [
          { task: 'Fire the third alert. Stop two of the three brokers and watch <code>KafkaPartitionBelowMinimum</code>.',
            hint: 'With two brokers down the lab cluster also loses its controller majority, so the exporter may see stale metadata. Start one broker again soon. Note what the exporter reports and what it cannot.' },
          { task: 'Read <code>ActiveControllerCount</code> on all three nodes and add the values.',
            hint: 'Change <code>kafka-1</code> to <code>kafka-2</code> and <code>kafka-3</code> in the helper. Exactly one node returns 1.' },
          { task: 'Watch request threads under load. Read <code>RequestHandlerAvgIdlePercent</code>, run the performance tool with a large record count, and read it again.',
            hint: 'The one-minute rate drops while the test runs and recovers afterwards.' },
          { task: 'Build one Grafana panel that shows <code>sum(kafka_topic_partition_under_replicated_partition)</code>, then stop and start a broker.',
            hint: 'Grafana is at <code>http://localhost:3005</code> with the Prometheus data source already connected. The line rises to a plateau and returns to zero.' },
        ],
      },
    ],
    mistakes: [
      {
        id: 'tf-12', type: 'tf', title: 'Five statements about monitoring',
        items: [
          { s: 'Under-replicated partitions above 0 means clients are failing.', fact: false, why: 'It means reduced redundancy. Offline partitions, or partitions below the minimum, mean failing clients.' },
          { s: 'An alert rule on a metric that does not exist reports an error.', fact: false, why: 'It loads and stays "inactive" for ever. Test rules by causing the fault.' },
          { s: 'A broker\'s under-replicated count covers only the partitions it leads.', fact: true, why: 'The lab saw 31 on one broker and 57 for the cluster.' },
          { s: 'Average latency is the best number to alert on.', fact: false, why: 'Averages hide slow requests. Use the 99th percentile.' },
          { s: 'A "for" time on a rule prevents alerts during short, normal events.', fact: true, why: 'The condition must hold that long before the alert fires.' },
        ],
      },
    ],
    staff: [
      {
        id: 'd-mon', type: 'design', title: 'A monitoring plan on one page',
        prompt: `<p>You take over a cluster of 12 brokers and 3 controllers with almost no monitoring: one dashboard of traffic graphs. Write the plan: which signals, which alerts at which severity, what application teams see, and how you prove the alerts work.</p>`,
        hints: ['Sort signals into availability, redundancy, capacity.', 'Which numbers must be added up over brokers?', 'How will you know an alert works before you need it?'],
        model: `<p><b>Page-level (availability).</b> Offline partitions above 0. Sum of active controllers not equal to 1. Partitions below the in-sync minimum above 0 for critical topics. A disk predicted to fill within 12 hours. Lag in time beyond the limit for each critical consumer.</p><p><b>Ticket-level (redundancy and capacity).</b> Under-replicated partitions above 0 for 15 minutes. A broker missing. A fenced broker. In-sync shrink rate above zero with no broker down. Request thread idle share below 30%. Disk above 60%, and predicted to fill within a week. Quorum leader epoch rising. Certificates expiring within 30 days.</p><p><b>Aggregation.</b> Per-broker metrics are summed over brokers before they are compared with a threshold.</p><p><b>For teams.</b> A dashboard for each team: lag in time for their groups, produce errors and latency for their clients, topic size, quota use.</p><p><b>Proof.</b> A game day each quarter on a test cluster: stop a broker, stop two, fill a disk, stop the controllers, stall a consumer. Each alert must fire with the right severity. Also an alert when an expected metric is absent.</p><p><b>Fallback.</b> The three command-line health checks and the lag command stay in the runbook, for the day the monitoring itself is down.</p>`,
        rubric: ['Alerts sorted by what they mean for clients, with severities', 'A sum over brokers for per-broker metrics, and a sum of 1 for the controller count', 'Disk alerts by predicted time to full', 'Lag measured in time, for each application', 'A regular test that causes each fault', 'An alert for missing metrics and a command-line fallback'],
      },
    ],
    test: [
      {
        id: 'boss-12', type: 'quizset', title: 'Module 12',
        questions: [
          { q: 'Which condition should page someone at night?', options: ['One broker down, nothing offline', 'Offline partitions above 0', 'Disk at 62%', 'A rolling restart'], answer: 1, why: 'Clients are failing now.' },
          { q: 'What must <code>ActiveControllerCount</code> add up to?', options: ['0', '1', 'The number of controllers', 'The number of brokers'], answer: 1, why: 'Exactly one active controller.' },
          { q: 'Why give an alert rule a "for" time?', options: ['To save storage', 'So that short, normal events do not fire it', 'It is required', 'To make it faster'], answer: 1, why: 'The condition must hold for that long.' },
          { q: 'How do you prove an alert works?', options: ['Read the rule', 'Check that it loaded', 'Cause the fault and see it fire', 'Ask the vendor'], answer: 2, why: 'A rule on a missing metric loads and never fires.' },
          { q: 'Where does consumer lag come from?', options: ['A broker metric', 'The end offset minus the group\'s committed offset', 'The controller', 'The producer'], answer: 1, why: 'Something must read both numbers.' },
        ],
      },
    ],
  },
};
