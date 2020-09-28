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
protos: vault_grpc_pb.js

# TODO: this is temporary until the proto definition settles down a
# bit, at which point we can git submodule the protobufs repo
.PHONY: proto-sync
proto-sync:
	cp ../plan-protobufs/pkg/vault/vault.proto vault.proto

vault_pb.js: vault.proto

# TODO: move this into a package.json script?
vault_grpc_pb.js: vault.proto
	./node_modules/grpc-tools/bin/protoc \
		--js_out=import_style=commonjs,binary:../plan-vault-hypercore \
		--grpc_out=../plan-vault-hypercore \
		--plugin=protoc-gen-grpc=./node_modules/grpc-tools/bin/grpc_node_plugin \
		vault.proto


# ----------------------------------------
# dev

.PHONY: run
run:
	node ./main.js

.PHONY: check
check:
	node_modules/eslint/bin/eslint.js main.js test/test.js test/helpers.js

.PHONY: test
test: clean
	node ./test/test.js

.PHONY: clean
clean:
	@rm -rf ./data

.PHONY: nuke
nuke: clean
	@rm -rf ./node_modules
