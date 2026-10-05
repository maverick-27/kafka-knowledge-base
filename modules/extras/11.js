// Activities for module 11, Security lab.
window.KB_EXTRAS = {
  module: '11',
  sections: {
    summary: [
      {
        id: 'ex-open', type: 'example', title: 'The topic that vanished on a Tuesday',
        story: `<p>A company ran an open cluster "inside the private network". One Tuesday the topic <code>invoices</code> disappeared, with eleven days of unprocessed data. Nobody admitted to deleting it.</p>`,
        steps: [
          `<b>What the investigation could use.</b> Nothing. With plain-text listeners every client is <code>User:ANONYMOUS</code>. The broker logs showed a delete request from an address in the office network range.`,
          `<b>What probably happened.</b> A developer ran a clean-up script meant for the test cluster with the production address in an old terminal.`,
          `<b>Why it was possible.</b> No authentication, so the cluster could not tell a developer's laptop from the invoicing service. No authorization, so everyone could delete everything.`,
          `<b>First change: identity.</b> A secured listener with one user for each application and one for each engineer.`,
          `<b>Second change: least permission.</b> The invoicing service may write to <code>invoices</code>. Nobody but the platform automation may delete a topic.`,
          `<b>Third change: a trail.</b> The authorizer log now records every denied request with the user's name, and the allowed deletes of the automation.`,
          `<b>What would have happened with these in place.</b> The script fails with "Authorization failed", and one line in a log names the user.`,
        ],
        takeaway: `"It is on a private network" protects against strangers. Most damage comes from valid colleagues and scripts pointed at the wrong place. Identity and least permission protect against those.`,
      },
      {
        id: 'q-layers', type: 'quiz', title: 'Which layer?',
        q: 'A client connects with TLS and the right password. It tries to read a topic and gets "Not authorized". Which layer refused it?',
        options: ['Encryption', 'Authentication', 'Authorization', 'The network'],
        answer: 2,
        why: 'The connection is private and the broker knows who the client is. No rule allows that user to do this.',
      },
    ],
    model: [
      {
        id: 'flow-gates', type: 'flow', title: 'bob reads a record, gate by gate',
        nodes: ['bob\'s client', 'TLS', 'Login', 'Authorizer', 'Topic'],
        steps: [
          { from: 0, to: 1, label: 'hello', say: 'The client opens a connection and starts a TLS handshake.' },
          { from: 1, to: 0, label: 'certificate', say: 'The broker sends its certificate: "I am kafka-sec, signed by Kafka Lab CA".' },
          { at: 0, say: 'The client finds "Kafka Lab CA" in its truststore, checks the signature, and checks that the name matches the host it dialled. The channel is now encrypted.' },
          { from: 0, to: 2, label: 'bob + password', say: 'Inside the encrypted channel, the client sends its user name and password.' },
          { at: 2, say: 'The broker checks them. From now on, every request on this connection belongs to <code>User:bob</code>.' },
          { from: 0, to: 3, label: 'join group billing', say: 'The consumer asks to use the group <code>billing</code>.' },
          { at: 3, say: 'The authorizer looks for a rule: bob, READ, group billing. Found. Allowed.' },
          { from: 0, to: 3, label: 'fetch payments-sec', say: 'The consumer asks for records from the topic.' },
          { from: 3, to: 4, label: 'allowed', say: 'Rule found: bob, READ, topic payments-sec. The request goes through.' },
          { from: 4, to: 0, label: 'p1 p2 p3', say: 'The records travel back, encrypted. If bob had used another group name, the request would have stopped at the authorizer.' },
        ],
      },
      {
        id: 'm-sec', type: 'match', title: 'Security vocabulary',
        pairs: [
          ['Truststore', 'The authorities a client or broker believes'],
          ['Keystore', 'A private key with its signed certificate'],
          ['Principal', 'The identity attached to a connection'],
          ['Access control list', 'Rules: who may do what on which resource'],
          ['Super user', 'A principal that skips all rules'],
          ['Listener', 'A port with its own security protocol'],
        ],
      },
    ],
    internals: [
      {
        id: 'o-migrate', type: 'order', title: 'Secure a running open cluster',
        q: 'Click the steps in an order that causes no outage.',
        items: ['Add a secured listener beside the open one.', 'Move applications to the secured listener, one by one.', 'Turn on the authorizer in a mode that still allows requests with no rule.', 'Add rules for each application and watch the log for requests that have none.', 'Switch to deny when no rule matches.', 'Remove the open listener.'],
        why: 'Each step can be checked before the next, and each can be undone. Turning on "deny" before the rules exist would stop every application at once.',
      },
      {
        id: 'q-group', type: 'quiz', title: 'What is missing?',
        q: 'A user has an allow rule for READ on the topic <code>orders</code>. Its consumer fails with "Not authorized to access group: shipping". What do you add?',
        options: ['WRITE on the topic', 'READ on the group shipping', 'Make it a super user', 'DESCRIBE on the cluster'],
        answer: 1,
        why: 'A consumer in a group needs permission on the group as well as on the topic. The lab showed this with bob.',
      },
    ],
    configs: [
      {
        id: 't-sec', type: 'tune', title: 'Lock down a client-facing listener',
        goal: 'Requirements: traffic must be <b>unreadable on the network</b>; every client must be <b>identified</b>; a client may do <b>only what a rule allows</b>.',
        knobs: [
          { id: 'proto', label: 'Listener protocol', options: [['PLAINTEXT', 'p'], ['SSL, no client certificates', 's'], ['SASL_PLAINTEXT', 'sp'], ['SASL_SSL', 'ss']], start: 0 },
          { id: 'authz', label: 'Authorizer', options: [['none (default)', false], ['standard authorizer', true]], start: 0 },
          { id: 'def', label: 'When no rule matches', options: [['allow', true], ['deny', false]], start: 0 },
        ],
        run: (v) => {
          const enc = v.proto === 's' || v.proto === 'ss', ident = v.proto === 'sp' || v.proto === 'ss', rules = v.authz && !v.def;
          let html = 'Encrypted: <b>' + (enc ? 'yes' : 'no') + '</b>. Clients identified: <b>' + (ident ? 'yes' : 'no') + '</b>. Only what a rule allows: <b>' + (rules ? 'yes' : 'no') + '</b>.';
          if (!enc) html += '\n' + (v.proto === 'sp' ? 'Passwords and data cross the network in clear text.' : 'Anyone on the network can read the traffic.');
          if (!ident) html += '\n' + (v.proto === 's' ? 'TLS without client certificates proves the broker, not the client. Every client is anonymous.' : 'Every client is User:ANONYMOUS.');
          if (!v.authz) html += '\nWith no authorizer, no rule is ever checked.';
          else if (v.def) html += '\nWith "allow when no rule matches", a user with no rules can do everything.';
          return { ok: enc && ident && rules, html };
        },
      },
    ],
    failures: [
      {
        id: 's-oom', type: 'scenario', title: 'A new service crashes at start-up',
        intro: 'A team deploys a new service against the secured cluster. It crashes at once with <code>java.lang.OutOfMemoryError: Java heap space</code>. They have raised its memory twice. It still crashes.',
        steps: [
          { situation: 'What do you ask first?',
            choices: [
              { label: 'For the client\'s Kafka settings, in particular <code>security.protocol</code>.', good: true, result: 'There is none. The client uses the default, <code>PLAINTEXT</code>, against a TLS port.' },
              { label: 'For more memory.', good: false, result: 'The client reads TLS bytes as a message length of about a gigabyte or more. No realistic heap is enough.' },
              { label: 'Whether the broker is overloaded.', good: false, result: 'The broker is fine. The crash happens in the client, in the first milliseconds.' },
            ] },
          { situation: 'They add <code>security.protocol=SASL_SSL</code> and credentials. Now: "SSL handshake failed". Next?',
            choices: [
              { label: 'Check that the client has a truststore with the authority that signed the broker\'s certificate.', good: true, result: 'It has none, and the lab authority is not one that Java trusts by default.' },
              { label: 'Turn off host name checking in the client.', good: false, result: 'It does not fix a missing authority, and it removes the check that the client is talking to the real broker.' },
            ] },
          { situation: 'With the truststore added: "Authorization failed" on the first write. Next?',
            choices: [
              { label: 'Read the authorizer log for the denied operation and resource, and add that rule.', good: true, result: 'The log shows the service\'s user denied WRITE on its topic. One <code>--producer</code> rule later, it works.' },
              { label: 'Add the service\'s user to <code>super.users</code>.', good: false, result: 'It works, and the service can now delete every topic on the cluster.' },
            ] },
          { situation: 'How do you spare the next team these three hours?',
            choices: [
              { label: 'A client template with the three settings, a self-service way to get a user and rules, and a page that maps each error to its cause.', good: true, result: 'The three errors of this lab, in order, are the standard journey of every new client. Document them once.' },
              { label: 'Open a plain-text port for new services.', good: false, result: 'You have reopened the hole the secured listener closed.' },
            ] },
        ],
        debrief: 'Out of memory, then handshake failed, then authorization failed: protocol, trust, permission. Each error is one gate. Knowing the sequence turns a day of confusion into ten minutes.',
      },
    ],
    lab: [
      {
        id: 'lab-11', type: 'lab', title: 'Four more experiments',
        intro: '<p>Run these on the secured cluster.</p>',
        tasks: [
          { task: 'Give alice a prefixed rule: write to every topic that starts with <code>alice.</code>, then create and write to <code>alice.test</code>.',
            hint: 'Add <code>--resource-pattern-type prefixed --topic alice.</code> to the <code>kafka-acls.sh</code> command. One rule then covers every topic with that prefix.' },
          { task: 'Add a deny rule for bob on <code>payments-sec</code> and try to read again.',
            hint: 'Use <code>--deny-principal User:bob --operation Read</code>. A deny rule wins over an allow rule.' },
          { task: 'Remove one of bob\'s rules and confirm the change needs no restart.',
            hint: 'Use <code>--remove</code> with the same options as the add command. The next request from bob is denied.' },
          { task: 'Make a second truststore that holds a different authority and connect with it.',
            hint: 'Run <code>make-certs.sh</code> in a copy of the folder to get another authority. The handshake fails: the client believes an authority that did not sign this broker.' },
        ],
      },
    ],
    mistakes: [
      {
        id: 'tf-11', type: 'tf', title: 'Five statements about security',
        items: [
          { s: 'With TLS on, the broker knows which user is connecting.', fact: false, why: 'Not unless client certificates are required. TLS alone proves the broker to the client.' },
          { s: 'A user with no rules sees an empty topic list, not an error.', fact: true, why: 'Listing returns only what the user may describe. The lab showed an empty list for alice.' },
          { s: 'A deny rule wins over an allow rule.', fact: true, why: 'This lets you carve an exception out of a broad allow.' },
          { s: 'A new access rule needs a broker restart.', fact: false, why: 'Rules are stored in the cluster metadata and apply at once.' },
          { s: 'The same truststore file works for every broker signed by one authority.', fact: true, why: 'The client needs the authority\'s certificate, not each broker\'s.' },
        ],
      },
    ],
    staff: [
      {
        id: 'd-sec', type: 'design', title: 'Security for a shared platform',
        prompt: `<p>Design the security model for a cluster shared by 30 teams and 200 services. The company has an identity provider and runs services in containers. Cover: listeners, how services and people authenticate, how permissions are organised, how credentials are rotated, and how you would detect misuse.</p>`,
        hints: ['Should a person and a service authenticate the same way?', 'How many rules do 200 services need if each rule names one topic?', 'What happens on the day a certificate expires?'],
        model: `<p><b>Listeners.</b> One <code>SASL_SSL</code> listener for clients. A separate secured listener for traffic between brokers, and a secured controller listener on a network only brokers and controllers can reach. No plain-text port anywhere.</p><p><b>Authentication.</b> Services use tokens from the identity provider, or certificates issued by the platform, tied to the service's identity in the container platform. People use the identity provider too, with short-lived credentials. No shared accounts, so that every action has a name.</p><p><b>Permissions.</b> Each team owns a topic and group prefix. One prefixed rule set for each team, not a rule for each topic. Sharing a topic with another team is an explicit rule approved by the owner. Rules live in version control and are applied by automation. Only that automation is a super user.</p><p><b>Rotation.</b> Short-lived tokens rotate by themselves. Certificates are issued for weeks, not years, renewed automatically, with an alert well before expiry and a practised procedure for the brokers' own certificates.</p><p><b>Detection.</b> Ship the authorizer log to the log platform. Alert on spikes of denials, on any use of a super user outside automation, and on topic deletions. Add quotas so that a valid user cannot overload the cluster.</p>`,
        rubric: ['Every listener secured, with the controller listener isolated', 'Identity from the company\'s provider, no shared accounts', 'Prefix-based rules for each team, managed in version control', 'Super users limited to automation', 'Automatic rotation with alerts before expiry', 'The authorizer log collected, with alerts on denials and deletions'],
      },
    ],
    test: [
      {
        id: 'boss-11', type: 'quizset', title: 'Module 11',
        questions: [
          { q: 'Which listener protocol gives both encryption and client identity by password?', options: ['PLAINTEXT', 'SSL', 'SASL_PLAINTEXT', 'SASL_SSL'], answer: 3, why: 'TLS for the channel, SASL for the login.' },
          { q: 'A plain client connects to a TLS port. What did the lab show?', options: ['A clear "use TLS" message', 'An out-of-memory error', 'A timeout only', 'It works'], answer: 1, why: 'The client reads TLS bytes as a huge message length.' },
          { q: 'What does the client check during the TLS handshake?', options: ['The broker\'s password', 'That the certificate is signed by an authority it trusts and names the host', 'The access rules', 'Nothing'], answer: 1, why: 'Signature and host name.' },
          { q: 'What does <code>allow.everyone.if.no.acl.found=false</code> mean?', options: ['Everyone is allowed', 'A request with no matching rule is denied', 'Rules are ignored', 'Only super users may connect'], answer: 1, why: 'Deny by default.' },
          { q: 'Where is the best place to see why a request was denied?', options: ['The client log', 'The authorizer log on the broker', 'The controller log', 'The topic description'], answer: 1, why: 'It names the principal, the operation, the resource and the deciding rule.' },
        ],
      },
    ],
  },
};
