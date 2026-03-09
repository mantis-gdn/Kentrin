# Kentrin

**A Constitutional Base-Layer Monetary Standard**

------------------------------------------------------------------------

## Overview

Kentrin is a deterministic, rule-based monetary issuance and clearing
standard.

It is **not a cryptocurrency**, **not a token**, and **not a speculative
asset**.

Kentrin defines a mathematically governed issuance protocol and a
federated clearing architecture designed to function as a constitutional
monetary base layer.

Unlike typical digital assets, Kentrin focuses on **structural monetary
rules** rather than economic incentives.

------------------------------------------------------------------------

# Core Idea

Most modern digital monetary systems rely on incentives, competition,
and governance votes.

Kentrin relies on **structure**.

Issuance follows a predefined mathematical schedule.\
Time governs expansion.\
Rules are fixed and transparent.

There are:

-   No discretionary adjustments\
-   No inflation toggles\
-   No policy committees

Money expands **because time advances**.

------------------------------------------------------------------------

# Deterministic Issuance

Kentrin supply increases at a predictable rate over fixed time epochs.

Properties of the emission model:

-   Issuance is integer-based
-   Expansion is linear and perpetual
-   The emission rule is immutable

Total supply at any moment can be calculated directly from time alone.

------------------------------------------------------------------------

# System Architecture

Kentrin is composed of three primary layers.

    +------------------------------+
    |         Wallet Layer         |
    |  (Key generation & signing)  |
    +--------------+---------------+
                   |
                   v
    +------------------------------+
    |       Clearing Layer         |
    |  Serverless verification API |
    |  - Signature validation      |
    |  - Ownership checks          |
    |  - Ledger insertion          |
    +--------------+---------------+
                   |
                   v
    +------------------------------+
    |        Ledger Layer          |
    |    kentrin_events database   |
    |  Immutable historical record |
    +------------------------------+

The wallet signs messages.\
The clearing layer verifies them.\
The ledger records them.

------------------------------------------------------------------------

# Wallet Protocol Specification

Kentrin wallets generate **Ed25519 keypairs**.

Addresses are deterministically derived from the public key.

    address = "KU1" + sha256(public_key)[0..40]

Example address:

    KU1a17e3b4d9e8c3c4aef98b9e4a9e12f81c4d8c

Wallet responsibilities:

-   Generate cryptographic keypairs
-   Derive deterministic addresses
-   Sign canonical messages
-   Submit events to clearing nodes

Wallets never directly modify the ledger.

------------------------------------------------------------------------

# Canonical Message Format

All ledger actions must follow a canonical message structure.

### Transfer Message

    KU|v1|TRANSFER|{note_id}|{from}|{to}|{ts}|{nonce}

Fields:

  Field     Description
  --------- -------------------------
  note_id   unique note identifier
  from      current owner
  to        new owner
  ts        unix timestamp
  nonce     replay protection value

The canonical message is signed with the sender's private key.

------------------------------------------------------------------------

# Ledger Event Model

The Kentrin ledger records **state transitions**, not balances.

Each entry represents a signed constitutional action.

Event types:

    ISSUE
    TRANSFER
    SPEND

Ledger records are immutable.

Ownership is determined by the **most recent valid event** for a note.

------------------------------------------------------------------------

# Database Schema

The ledger is stored in MySQL.

Primary table:

    kentrin_events

Key columns:

  Column              Description
  ------------------- ------------------------------
  event_index         sequential ledger index
  event_type          ISSUE / TRANSFER / SPEND
  note_id             unique note identifier
  parent_note_id      lineage reference
  denom               note denomination
  from_address        previous owner
  to_address          new owner
  nonce               replay protection
  txid                deterministic transaction id
  signature_b64       cryptographic signature
  canonical_message   signed message
  created_at          ledger timestamp

------------------------------------------------------------------------

# Event Validation Rules

Before a ledger event is accepted, the clearing layer enforces several
rules.

### Signature Verification

The system verifies:

    verify(signature, canonical_message, public_key)

If verification fails, the event is rejected.

------------------------------------------------------------------------

### Ownership Check

Only the current owner may transfer a note.

    latest_event.to_address == from_address

------------------------------------------------------------------------

### Replay Protection

Each event must contain a unique nonce.

Duplicate nonce usage invalidates the transaction.

------------------------------------------------------------------------

### Canonical Message Integrity

The signed message must exactly match the submitted transaction data.

If any field differs, the transaction fails.

------------------------------------------------------------------------

# Note Lifecycle

A Kentrin note follows a simple lifecycle.

    ISSUE → TRANSFER → TRANSFER → ... → SPEND

Example:

    Treasury issues note
          ↓
    Wallet A receives note
          ↓
    Wallet A transfers to Wallet B
          ↓
    Wallet B transfers to Wallet C
          ↓
    Wallet C spends note

Each step creates a new immutable ledger event.

------------------------------------------------------------------------

# Clearing Layer

Clearing nodes validate and record transactions.

Responsibilities:

-   Verify signatures
-   Confirm ownership
-   Enforce validation rules
-   Record ledger events

Clearing nodes **do not mint currency**.

They only validate and record state transitions.

------------------------------------------------------------------------

# API Functions

The reference implementation uses Netlify serverless functions.

### ledger-submit

Handles incoming ledger events.

Responsibilities:

-   Parse request
-   Validate canonical message
-   Verify signature
-   Confirm ownership
-   Write event to ledger

------------------------------------------------------------------------

### note-read

Returns the latest state for a note.

Example response:

    {
      "note_id": "...",
      "denom": 10,
      "current_owner": "KU1...",
      "event_count": 5
    }

Wallets use this endpoint to determine the latest state before
submitting transfers.

------------------------------------------------------------------------

# Environment Variables

Clearing functions require the following variables.

    DB_HOST
    DB_NAME
    DB_USERNAME
    DB_PASSWORD
    TREASURY_MINT_SECRET

PlanetScale requires **TLS-enabled connections**.

------------------------------------------------------------------------

# Time Attestation Framework

Because issuance is time-based, Kentrin relies on a federated network of
Time Attestors.

-   Nine independent Time Attestors operate under constitutional rules.
-   Epoch recognition requires a **5-of-9 quorum**.
-   Attestations are cryptographically signed.
-   Time proofs are mandatory and verifiable.

There is no global blockchain ledger.\
There is no chain of blocks.

Only signed, proof-backed time validation.

------------------------------------------------------------------------

# Design Principles

Kentrin is built on the following foundations:

-   Constitutional structure over governance politics
-   Deterministic mathematics over discretion
-   Transparency over speculation
-   Stability over hype

------------------------------------------------------------------------

# What Kentrin Is Not

Kentrin is not:

-   A meme coin
-   A yield instrument
-   A governance token
-   A speculative pump vehicle
-   A blockchain fork

It does not depend on inflationary reward cycles.\
It does not require continuous network competition to function.

------------------------------------------------------------------------

# Vision

Kentrin is an attempt to define money as **law-bound mathematics**.

Not mined.\
Not voted.\
Not gamified.

Structured.\
Deterministic.\
Constitutional.
