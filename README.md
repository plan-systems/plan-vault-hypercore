# plan-vault-hypercore

_An implementation of the PLAN storage layer__

### Development status

This route was abandoned in lieu of using libp2p as the initial vault
implementation.

Pre-alpha prototyping was underway. The only thing that's known to
work is that which is covered by tests. Not yet wired up for p2p, lots
of validation bugs, and things like crashes if you close a feed
twice. See `TODO`s in the code for details; as the prototype
solidifies this repo will use GitHub issues to track progress.

### Build

With a recent Node.js tool chain (verified on v12.18.3), install
dependencies and re-generate the protobuf code via `make build`.

For now, the `vault.proto` file is manually synced from
[`plan-protobufs`](https://github.com/plan-systems/plan-protobufs). If
you have that repo checked out as a sibling directory to this repo,
you can sync the file via `make proto-sync`.

### Test

The tests are integration tests while we work through the prototype
and work out the details of the API between the pnode and the vault.

* Run the vault via `make run`.
* In a separate terminal window, run the tests via `make test`.
