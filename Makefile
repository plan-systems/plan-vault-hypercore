MAKEFLAGS += --warn-undefined-variables
SHELL = /bin/bash -o nounset -o errexit -o pipefail
.DEFAULT_GOAL = build

# ----------------------------------------
# build

.PHONY: build
build: deps protos

.PHONY: deps
deps:
	npm install

.PHONY: protos
protos: lib/vault_grpc_pb.js lib/vault_pb.js lib/vault.proto

# TODO: this is temporary until the proto definition settles down a
# bit, at which point we can git submodule the protobufs repo
.PHONY: proto-sync
proto-sync:
	cp ../plan-protobufs/pkg/vault/vault.proto lib/vault.proto

lib/vault_pb.js: lib/vault.proto

# TODO: move this into a package.json script?
lib/vault_grpc_pb.js: lib/vault.proto
	./node_modules/grpc-tools/bin/protoc \
		--js_out=import_style=commonjs,binary:../plan-vault-hypercore \
		--grpc_out=../plan-vault-hypercore \
		--plugin=protoc-gen-grpc=./node_modules/grpc-tools/bin/grpc_node_plugin \
		lib/vault.proto


# ----------------------------------------
# dev

.PHONY: run
run:
	node ./main.js

.PHONY: check
check:
	node_modules/eslint/bin/eslint.js main.js lib/feeds.js lib/service.js lib/streams.js test/*.js

.PHONY: test
test: clean
	node ./test/test.js

.PHONY: clean
clean:
	@rm -rf ./data

.PHONY: nuke
nuke: clean
	@rm -rf ./node_modules
