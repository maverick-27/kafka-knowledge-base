// Activities for module 08, Ecosystem.
window.KB_EXTRAS = {
  module: '08',
  sections: {
    summary: [
      {
        id: 'ex-rename', type: 'example', title: 'One renamed field, six broken teams',
        story: `<p>An orders team cleaned up its event: <code>cust_id</code> became <code>customerId</code>. Their tests passed. Twenty minutes after the release, six other teams had failing consumers. There was no schema registry; the events were JSON by convention.</p>`,
        steps: [
          `<b>What each consumer did.</b> Three threw an error on the missing field and stopped. Two wrote a null customer into their databases. One silently assigned every order to customer 0.`,
          `<b>Why nobody saw it coming.</b> The producer's tests only tested the producer. The contract with consumers existed only in people's heads.`,
          `<b>The emergency fix.</b> The orders team released again, writing both field names.`,
          `<b>The data repair.</b> The two teams with nulls had to find and reprocess twenty minutes of orders. The team with customer 0 found out a week later.`,
          `<b>The real fix: a registry.</b> The event got an Avro schema, registered under the subject <code>orders-value</code> with <code>BACKWARD</code> compatibility.`,
          `<b>What that would have done.</b> A rename is "remove a field, add a field with no default". The registry refuses it, as it refused version 3 in the lab. The release would have failed in the build pipeline, not in production.`,
          `<b>How to rename properly.</b> Add <code>customerId</code> with a default. Write both. Move every consumer. Then remove <code>cust_id</code>.`,
        ],
        takeaway: `A topic is a public interface. Without a checked schema, every producer release is a bet that no consumer depends on what you changed.`,
      },
      {
        id: 'q-what', type: 'quiz', title: 'Which tool for which job?',
        q: 'You must copy every row change from a PostgreSQL table into a Kafka topic, without changing the application that writes the table. What do you use?',
        options: ['A Kafka Streams application', 'A change data capture source connector on Kafka Connect', 'A schema registry', 'A consumer group'],
        answer: 1,
        why: 'A capture connector reads the database\'s own change log and needs no change to the application.',
      },
    ],

    model: [
      {
        id: 'flow-registry', type: 'flow', title: 'A record and its schema',
        nodes: ['Producer', 'Schema registry', 'Topic', 'Consumer'],
        steps: [
          { from: 0, to: 1, label: 'schema?', say: 'Before its first record, the producer\'s serializer sends the record\'s schema to the registry.' },
          { at: 1, store: [1], chip: 'id 2', say: 'The registry checks the schema against the subject\'s compatibility rule. It passes, and gets the id 2.' },
          { from: 1, to: 0, label: 'id 2', say: 'The registry answers with the id. The producer caches it; it will not ask again for this schema.' },
          { from: 0, to: 2, label: '[2] + bytes', store: [2], chip: '[2] bytes', say: 'The producer writes the record: the schema id in front, then the encoded fields. The schema itself is not in the record.' },
          { from: 2, to: 3, label: '[2] + bytes', say: 'A consumer fetches the record and reads the id in front.' },
          { from: 3, to: 1, label: 'schema 2?', say: 'It has not seen schema 2, so it asks the registry.' },
          { from: 1, to: 3, label: 'schema 2', say: 'The registry returns the schema. The consumer caches it and decodes the record. For the next million records it needs no more calls.' },
        ],
      },
      {
        id: 'm-compat', type: 'match', title: 'Compatibility modes',
        pairs: [
          ['BACKWARD', 'New consumers can read old data; upgrade consumers first'],
          ['FORWARD', 'Old consumers can read new data; upgrade producers first'],
          ['FULL', 'Both directions; only optional fields may change'],
          ['NONE', 'No check at all'],
          ['A _TRANSITIVE mode', 'Checked against every earlier version, not only the last'],
        ],
      },
    ],

    internals: [
      {
        id: 'o-outbox', type: 'order', title: 'An event through the outbox',
        q: 'Click the steps in order.',
        items: ['The service begins a database transaction.', 'It writes the business change and an outbox row.', 'It commits the database transaction.', 'The capture connector reads the outbox row from the database log.', 'The connector publishes the event to Kafka.', 'Consumers process the event and ignore repeats by event id.'],
        why: 'The first three steps are atomic in the database. The last three happen afterwards and can be retried safely.',
      },
      {
        id: 'flow-dlq', type: 'flow', title: 'Three records through a sink connector',
        intro: 'The sink expects JSON. Tolerance is "all", with a dead-letter topic.',
        nodes: ['Topic json-in', 'Converter', 'Target file', 'Dead-letter topic'],
        steps: [
          { from: 0, to: 1, label: '{"id":1}', say: 'The sink task consumes the first record and hands its bytes to the JSON converter.' },
          { from: 1, to: 2, label: 'id=1', store: [2], chip: 'id=1', say: 'It parses. The record is written to the target.' },
          { from: 0, to: 1, label: 'this is not json', fail: true, say: 'The second record does not parse. The converter throws an error.' },
          { from: 1, to: 3, label: 'this is not json', store: [3], chip: 'bad + headers', say: 'With <code>errors.tolerance=all</code> the task does not stop. It writes the original bytes to the dead-letter topic, with headers: topic, partition, offset 1, the stage that failed, and the error.' },
          { from: 0, to: 1, label: '{"id":2}', say: 'The task continues with the third record.' },
          { from: 1, to: 2, label: 'id=2', store: [2], chip: 'id=2', say: 'It is written to the target. Two delivered, one set aside with its reason. With tolerance "none", the task would have stopped at the second record and delivered nothing more.' },
        ],
      },
      {
        id: 'q-task', type: 'quiz', title: 'Running or not?',
        q: 'A connector\'s status shows <code>"connector": {"state": "RUNNING"}</code> and <code>"tasks": [{"id": 0, "state": "FAILED"}]</code>. Is data flowing?',
        options: ['Yes, the connector is running.', 'No. The task does the copying, and it has stopped.', 'Partly, at half speed.', 'It cannot be told from this.'],
        answer: 1,
        why: 'The connector only defines and supervises the job. Tasks move the data. The lab showed exactly this state with an empty output file.',
      },
    ],

    configs: [
      {
        id: 't-sink', type: 'tune', title: 'A sink connector that survives bad records',
        goal: 'Requirements: one malformed record must <b>not stop the pipeline</b>; no record may be <b>lost without trace</b>; and you must be able to <b>tell why</b> a record failed.',
        knobs: [
          { id: 'tol', label: 'errors.tolerance', options: [['none (default)', 'none'], ['all', 'all']], start: 0 },
          { id: 'dlq', label: 'Dead-letter topic', options: [['not set', false], ['set', true]], start: 0 },
          { id: 'hdr', label: 'Context headers', options: [['off', false], ['on', true]], start: 0 },
        ],
        run: (v) => {
          const okStop = v.tol === 'all', okTrace = v.tol === 'none' || v.dlq, okWhy = v.dlq && v.hdr;
          let html = 'Pipeline survives a bad record: <b>' + (okStop ? 'yes' : 'no') + '</b>. Nothing lost without trace: <b>' + (okTrace ? 'yes' : 'no') + '</b>. Reason recorded: <b>' + (okWhy ? 'yes' : 'no') + '</b>.';
          if (!okStop) html += '\nWith tolerance "none", the task fails at the first bad record and delivers nothing after it.';
          if (okStop && !v.dlq) html += '\nTolerance "all" without a dead-letter topic skips bad records silently. They are gone.';
          if (v.dlq && !v.hdr) html += '\nThe bad record is kept, but with no headers you cannot see which stage failed or where it came from.';
          if (v.dlq && v.tol === 'none') html += '\nA dead-letter topic is only used when tolerance is "all".';
          if (okStop && okTrace && okWhy) html += '\nThen add an alert on any record arriving in the dead-letter topic, and give that topic an owner.';
          return { ok: okStop && okTrace && okWhy, html };
        },
      },
      {
        id: 'c-repeat', type: 'calc', title: 'How many repeats?',
        q: 'A source connector publishes 500 records each second and saves its position every 60 seconds (the default). It crashes just before a save. About how many records does it publish a second time after the restart?',
        unit: 'records', answer: 30000, tol: 0.05,
        hint: 'Everything since the last saved position is sent again.',
        working: '500 records × 60 seconds = 30,000 records. The connector resumes from the last saved position, which is almost a minute old. This is why consumers must ignore repeats, or the connector must use exactly-once source support.',
      },
    ],

    failures: [
      {
        id: 's-connect', type: 'scenario', title: 'The warehouse table stopped updating',
        intro: 'An analyst reports that the <code>orders</code> table in the data warehouse has had no new rows for three hours. It is fed by a sink connector, <code>orders-warehouse</code>. The Connect dashboard shows the connector as green.',
        steps: [
          { situation: 'The dashboard is green and data is not flowing. Where do you look?',
            choices: [
              { label: 'The status of the connector\'s tasks, through the HTTP interface.', good: true, result: 'Connector <code>RUNNING</code>, task 0 <code>FAILED</code>, with a trace: a conversion error on one record. The dashboard only showed the connector\'s state.' },
              { label: 'Restart the whole Connect cluster.', good: false, result: 'Every connector on the cluster stops and rebalances. The task starts, reads the same record, and fails again.' },
              { label: 'Delete and recreate the connector.', good: false, result: 'It starts from its committed position, hits the same record, and fails again. You have also lost the error trace.' },
            ] },
          { situation: 'One record cannot be converted: a producer sent a text value where a number is expected. Thousands of good records wait behind it. What do you do?',
            choices: [
              { label: 'Update the connector with <code>errors.tolerance=all</code> and a dead-letter topic with context headers, then restart the task.', good: true, result: 'The task restarts. The bad record goes to the dead-letter topic with its origin and error. The backlog drains in six minutes.' },
              { label: 'Set <code>errors.tolerance=all</code> with no dead-letter topic, to get moving.', good: false, result: 'It moves, and the bad order is skipped with no record of it. The warehouse is now one order short and nobody knows which.' },
              { label: 'Reset the connector\'s consumer group to the latest offset.', good: false, result: 'Three hours of orders are skipped.' },
            ] },
          { situation: 'The warehouse is current again. One order is in the dead-letter topic. What now?',
            choices: [
              { label: 'Find which producer wrote the bad value, fix it, and replay the corrected record.', good: true, result: 'A new version of the checkout service sent the amount as text. It had no schema check. The team adds the topic to the schema registry.' },
              { label: 'Nothing; the pipeline is running.', good: false, result: 'The order stays missing, and the producer keeps sending bad records, each of which now goes quietly to a topic nobody reads.' },
            ] },
          { situation: 'Which two things would have made this a non-event?',
            choices: [
              { label: 'An alert on task state and on records in the dead-letter topic; and a schema on the topic so that the bad record was refused at the producer.', good: true, result: 'The first shortens detection from hours to minutes. The second prevents the bad record from existing.' },
              { label: 'More Connect workers.', good: false, result: 'Capacity was never the problem.' },
            ] },
        ],
        debrief: 'In Connect, watch tasks, not connectors. Decide for each sink what a bad record should do before the first one arrives. And remember that the cheapest place to stop bad data is at the producer, with a schema.',
      },
    ],

    lab: [
      {
        id: 'lab-08', type: 'lab', title: 'Four more experiments',
        intro: '<p>These continue from the Connect worker and schema registry of the main lab.</p>',
        tasks: [
          { task: 'Restart a failed task. Get the status of <code>json-strict</code>, restart its task through the HTTP interface, and read the status again.',
            hint: 'A <code>POST</code> to <code>/connectors/json-strict/tasks/0/restart</code>. The task fails again at once, on the same record: a restart does not fix a data problem.' },
          { task: 'Test a field rename against the registry. Write a version of the schema where <code>amount</code> is called <code>total</code> and test it with the compatibility call.',
            hint: 'Under <code>FULL</code>, which the lab set on the subject, the registry answers <code>is_compatible: false</code>, with one message for the field removed and one for the field added.' },
          { task: 'Add a transform. Recreate the file sink with a transform that adds a field or changes the topic name.',
            hint: 'Kafka ships transforms such as <code>RegexRouter</code> and <code>InsertField</code>. They are set with <code>transforms</code> and settings named <code>transforms.NAME.type</code>.' },
          { task: 'Stop the Connect worker, add three lines to the input file, start the worker, and count the lines in the output file.',
            hint: 'The three new lines appear once. The source connector saved how far it had read in the file, in the offsets topic.' },
        ],
      },
    ],

    mistakes: [
      {
        id: 'tf-08', type: 'tf', title: 'Six statements about the ecosystem',
        items: [
          { s: 'The broker rejects a record that does not match the topic\'s schema.', fact: false, why: 'The broker stores bytes. Checks happen in the producer\'s serializer, with the registry.' },
          { s: 'Kafka Connect is part of Apache Kafka.', fact: true, why: 'It ships in the same download. A schema registry does not.' },
          { s: 'With a schema registry, the full schema travels with every record.', fact: false, why: 'Only a schema id travels with the record.' },
          { s: 'Adding a field with a default value is compatible in every mode.', fact: true, why: 'New readers use the default for old data, and old readers ignore the extra field.' },
          { s: 'Change data capture reads the tables with repeated queries.', fact: false, why: 'It reads the database\'s log of changes, so it sees deletes and every intermediate update.' },
          { s: 'The outbox pattern removes the need for consumers to handle repeats.', fact: false, why: 'The connector delivers at least once. Consumers still ignore repeats by event id.' },
        ],
      },
    ],

    staff: [
      {
        id: 'd-publish', type: 'design', title: 'Publish order events from a database-backed service',
        prompt: `<p>An order service stores orders in PostgreSQL. Eight other teams need to know when an order is created, paid or cancelled. Today the service writes to the database and then sends to Kafka, and events are sometimes missing. Design a reliable way to publish these events, including the schema, and say what consumers must do.</p>`,
        hints: ['Why are events missing today?', 'Capture the business tables directly, or use an outbox? What does each expose?', 'What can still arrive twice, and who handles that?'],
        model: `<p><b>Cause.</b> Two separate writes. A crash, a timeout or an error between them leaves the database and Kafka different.</p><p><b>Outbox.</b> In the same database transaction as the order change, insert a row into an <code>outbox</code> table: event id, order id, event type, payload, created time. A change data capture connector reads new outbox rows from the database log and publishes them to <code>order-events</code>, keyed by order id so that the events of one order stay in order.</p><p><b>Why not capture the orders table directly.</b> It would publish the table layout as a public interface. An outbox publishes events with business meaning and a stable shape, and the tables can be refactored freely.</p><p><b>Schema.</b> Register the event schema with <code>BACKWARD</code> or <code>FULL</code> compatibility. Check compatibility in the build pipeline. Turn automatic registration off in production.</p><p><b>Consumers.</b> Delivery is at least once: each consumer stores the event id with its own result and ignores an id it has seen.</p><p><b>Operation.</b> Clean old outbox rows. Monitor the connector's task state and its lag behind the database log, because a stopped connector makes the database keep its log. Give the topic 3 copies and a minimum of 2.</p>`,
        rubric: ['The dual write named as the cause', 'An outbox row in the same database transaction', 'A capture connector, with the order id as the key', 'A reason for an outbox over capturing business tables', 'A registered schema with a compatibility mode, checked before release', 'Consumers ignore repeats by event id, and the connector is monitored'],
      },
      {
        id: 'ex-breaking', type: 'example', title: 'Making a breaking change without breaking anyone',
        story: `<p>The <code>payments</code> event stores <code>amount</code> as a floating-point number. Rounding errors have appeared in reports. The team wants <code>amount</code> as an integer number of cents. The topic has 14 consumers in 9 teams, and <code>FULL</code> compatibility.</p>`,
        steps: [
          `<b>Why it cannot be done in place.</b> Changing a field's type is refused in every mode, and old consumers would decode the bytes wrongly.`,
          `<b>Step 1: add.</b> Add a new field <code>amountCents</code> with a default of 0. This passes <code>FULL</code>. Producers fill both fields.`,
          `<b>Step 2: announce.</b> Tell the 9 teams: read <code>amountCents</code>; <code>amount</code> will be removed on a stated date.`,
          `<b>Step 3: measure.</b> Use consumer group names and client ids to track who has released a new version. Do not rely on the announcement.`,
          `<b>Step 4: the stragglers.</b> Two teams miss the date. Extend it once, with their managers informed. Removing a field while a consumer still reads it would break that consumer.`,
          `<b>Step 5: remove.</b> <code>amount</code> has no default, so removing it is refused under <code>FULL</code>. First add a default to <code>amount</code> in one version, then remove it in the next.`,
          `<b>Total time:</b> seven weeks for one field. This is normal for a shared interface.`,
        ],
        takeaway: `A breaking change is three compatible changes and a migration between them: add the new, move every reader, remove the old. The registry forces you to take the slow, safe path.`,
      },
    ],

    test: [
      {
        id: 'boss-08', type: 'quizset', title: 'Module 08',
        questions: [
          { q: 'Under <code>BACKWARD</code>, which change is refused?', options: ['Remove a field', 'Add a field with a default', 'Add a field without a default', 'None of them'], answer: 2, why: 'A new reader would find no value in old records and has no default to use.' },
          { q: 'Where does a distributed Connect cluster keep its connector configurations?', options: ['In files on each worker', 'In a Kafka topic', 'In the schema registry', 'In ZooKeeper'], answer: 1, why: 'The config storage topic. Offsets and status have their own topics.' },
          { q: 'What does a dead-letter topic record contain when context headers are on?', options: ['Only an error message', 'The original record plus headers with the origin and the error', 'A corrected record', 'A summary count'], answer: 1, why: 'The lab showed the original value with headers for topic, partition, offset, stage and exception.' },
          { q: 'Why is "write to the database, then to Kafka" unsafe?', options: ['Kafka is slower', 'The two writes are not atomic; a failure between them leaves them different', 'The database locks the row', 'It is safe'], answer: 1, why: 'This is the dual write problem.' },
          { q: 'What must consumers of outbox events still do?', options: ['Nothing', 'Ignore repeated events by id', 'Read the database too', 'Use transactions'], answer: 1, why: 'The connector delivers at least once.' },
        ],
      },
    ],
  },
};
