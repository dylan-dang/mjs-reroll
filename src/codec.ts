import { type Message as ProtobufMessage, Root, Type } from 'protobufjs';
import {
  MessageType,
  type MethodNames,
  type MethodParam,
  type ProtobufSchemas,
  type ServiceNames,
  type ProtoSchemaToTs,
} from './api';
import assert from 'assert';

export type UnwrappedMessage<T extends object = {}> = ProtobufMessage<T> & {
  name?: string;
  data: Buffer;
} & T;

export class Codec {
  public static decodePaipuId(paipu: string): string {
    let e = '';
    for (
      let i = '0'.charCodeAt(0), n = 'a'.charCodeAt(0), a = 0;
      a < paipu.length;
      a++
    ) {
      let o = -1;
      const r = paipu.charAt(a),
        s = r.charCodeAt(0);
      s >= i && s < i + 10
        ? (o = s - i)
        : s >= n && s < n + 26 && (o = s - n + 10),
        (e +=
          -1 != o
            ? (o = (o + 55 - a) % 36) < 10
              ? String.fromCharCode(o + i)
              : String.fromCharCode(o + n - 10)
            : r);
    }
    return e;
  }

  public static stripMessageType(data: Buffer): {
    type: MessageType;
    data: Buffer;
  } {
    return {
      type: data[0],
      data: data.subarray(1),
    };
  }

  public static addMessageType(type: MessageType, data: Uint8Array): Buffer {
    return Buffer.concat([Buffer.from([type]), data]);
  }

  public static stripIndex(data: Buffer): {
    index: number;
    data: Buffer;
  } {
    return {
      index: data[0] | (data[1] << 8),
      data: data.slice(2),
    };
  }

  public static addIndex(index: number, data: Uint8Array): Buffer {
    return Buffer.concat([Buffer.from([index & 0xff, index >> 8]), data]);
  }


  public readonly wrapper: Type;

  constructor(public readonly root: Root) {
    this.wrapper = root.lookupType('Wrapper');
  }

  public decode(name: string, data: Buffer) {
    return this.root.lookupType(name).decode(data) as UnwrappedMessage;
  }

  public enDecodeAction(p: Buffer) {
    for (var L = [132, 94, 78, 66, 57, 162, 31, 96, 28], t = 0; t < p.byteLength; t++) {
        var j = (23 ^ p.byteLength) + 5 * t + L[t % L.length] & 255;
        p[t] ^= j;
    }
    return p;
  };

  public unwrap(data: Buffer) {
    return this.wrapper.decode(data) as UnwrappedMessage;
  }

  public decodeMessage(
    message: Buffer,
    nameMap: { name: string }[]
  ):
    | {
        type: MessageType.Notification;
        name: string;
        data: UnwrappedMessage;
      }
    | {
        type: MessageType.Response | MessageType.Request;
        name: string;
        data: UnwrappedMessage;
        index: number;
      } {
    const { type, data: wrappedData } = Codec.stripMessageType(message);
    if (type === MessageType.Notification) {
      const {name, data} = this.unwrap(wrappedData);
      assert(name, `Notification name is undefined`);
      
      return {
        type,
        name: name.slice(4),
        data: this.decode(name, data),
      };
    }
    if (type !== MessageType.Response && type !== MessageType.Request) {
      throw new Error(`Unknown Message Type ${type}`);
    }
    const { index, data } = Codec.stripIndex(wrappedData);
    const unwrappedMessage = this.unwrap(data);
    const name =  nameMap[index].name;
    return {
      type,
      index,
      name,
      data: this.decode(name, unwrappedMessage.data)
    };
  }

  public encodeMessage<
    ServiceName extends ServiceNames<ProtobufSchemas>,
    MethodName extends MethodNames<ServiceName>
  >(
    serviceName: ServiceName,
    methodName: MethodName,
    data: MethodParam<ServiceName, MethodName>
  ) {
    const name = `.lq.${serviceName}.${methodName}`;

    const service = this.root.lookupService(['lq', serviceName]);
    const method = service.methods[methodName];

    const reqType = this.root.lookupType(method.requestType);
    const payload = {
      name,
      data: reqType.encode(reqType.create(data)).finish(),
    };

    return {
      method,
      data: this.wrapper.encode(this.wrapper.create(payload)).finish(),
    };
  }
}
