node:
	./scripts/fetch-node.sh

release: node
	cd server && npm install --no-progress && npm run release

test:
	cd server && npm install --no-progress && npm test

.PHONY: node release test
