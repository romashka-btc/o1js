import { Field, isReady, shutdown } from '../../snarky.js';
import { ZkProgram } from '../../lib/proof_system.js';
import Client from '../MinaSigner.js';
import { PrivateKey, Signature } from '../../lib/signature.js';
import { provablePure } from '../../lib/circuit_value.js';
import { expect } from 'expect';
import { Provable } from 'src/lib/provable.js';

let fields = [10n, 20n, 30n, 340817401n, 2091283n, 1n, 0n];
let privateKey = 'EKENaWFuAiqktsnWmxq8zaoR8bSgVdscsghJE5tV6hPoNm8qBKWM';

// sign with mina-signer
let client = new Client({ network: 'mainnet' });
let signed = client.signFields(fields, privateKey);

// verify with mina-signer
let ok = client.verifyFields(signed);
expect(ok).toEqual(true);

// sign with snarkyjs and check that we get the same signature
await isReady;
let fieldsSnarky = fields.map(Field);
let privateKeySnarky = PrivateKey.fromBase58(privateKey);
let signatureSnarky = Signature.create(privateKeySnarky, fieldsSnarky);
expect(signatureSnarky.toBase58()).toEqual(signed.signature);

// verify out-of-snark with snarkyjs
let publicKey = privateKeySnarky.toPublicKey();
let signature = Signature.fromBase58(signed.signature);
signature.verify(publicKey, fieldsSnarky).assertTrue();

// verify in-snark with snarkyjs
const Message = Provable.Array(Field, fields.length);

const MyProgram = ZkProgram({
  publicInput: provablePure(null),
  methods: {
    verifySignature: {
      privateInputs: [Signature, Message],
      method(_: null, signature: Signature, message: Field[]) {
        signature.verify(publicKey, message).assertTrue();
      },
    },
  },
});

await MyProgram.compile();
let proof = await MyProgram.verifySignature(null, signature, fieldsSnarky);
ok = await MyProgram.verify(proof);
expect(ok).toEqual(true);

// negative test - sign with the wrong private key

let { privateKey: wrongKey } = client.genKeys();
let invalidSigned = client.signFields(fields, wrongKey);
let invalidSignature = Signature.fromBase58(invalidSigned.signature);

// can't verify out of snark
invalidSignature.verify(publicKey, fieldsSnarky).assertFalse();

// can't verify in snark
let error = await MyProgram.verifySignature(
  null,
  invalidSignature,
  fieldsSnarky
).catch((err) => err); // the error is an array...
expect(error[2].message).toContain('Constraint unsatisfied');

// negative test - try to verify a different message

let wrongFields = [...fieldsSnarky];
wrongFields[0] = wrongFields[0].add(1);

// can't verify out of snark
signature.verify(publicKey, wrongFields).assertFalse();

// can't verify in snark
error = await MyProgram.verifySignature(null, signature, wrongFields).catch(
  (err) => err
); // the error is an array...
expect(error[2].message).toContain('Constraint unsatisfied');
