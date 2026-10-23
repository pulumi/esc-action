// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

const config = {
	input: 'src/index.ts',
	output: {
		esModule: true,
		file: 'dist/index.js',
		format: 'es',
		sourcemap: true
	},
	plugins: [typescript(), nodeResolve({ preferBuiltins: true, exportConditions: ['require'] }), commonjs(), json(), terser()]
}

export default config
