/**
 * A lightweight, dependency-free, browser-compatible XML-RPC client.
 * Handles request serialization and response parsing.
 */

// --- Main public functions ---

/**
 * Makes an XML-RPC call to a server.
 * @param {string} url - The URL of the XML-RPC server.
 * @param {string} methodName - The name of the method to call.
 * @param {Array} params - An array of parameters for the method.
 * @returns {Promise<any>} - A promise that resolves with the parsed response data.
 * @throws {Error} - Throws an error for network issues, HTTP errors, or XML-RPC faults.
 */
export async function xmlrpc(url, methodName, params) {
    const requestBody = XMLRPC_makeRequest(methodName, params);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: requestBody,
    });

    if (!response.ok) {
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    return XMLRPC_parseResponse(responseText);
}

/**
 * Serializes a method call into an XML-RPC request body.
 * @param {string} methodName - The method name.
 * @param {Array} params - The parameters.
 * @returns {string} - The XML request body.
 */
export function XMLRPC_makeRequest(methodName, params) {
    let paramsXML = '';
    for (const param of params) {
        paramsXML += `<param>${serialize(param)}</param>`;
    }

    return `<?xml version="1.0"?>
<methodCall>
  <methodName>${methodName}</methodName>
  <params>${paramsXML}</params>
</methodCall>`;
}

// --- Internal serialization helpers ---

function serialize(data) {
    const type = typeof data;
    let xml = '<value>';

    if (data === null) {
        xml += '<nil/>';
    } else if (type === 'string') {
        xml += `<string>${escapeXml(data)}</string>`;
    } else if (type === 'number') {
        if (Number.isInteger(data)) {
            xml += `<i4>${data}</i4>`;
        } else {
            xml += `<double>${data}</double>`;
        }
    } else if (type === 'boolean') {
        xml += `<boolean>${data ? 1 : 0}</boolean>`;
    } else if (data instanceof Date) {
        xml += `<dateTime.iso8601>${data.toISOString()}</dateTime.iso8601>`;
    } else if (Array.isArray(data)) {
        xml += '<array><data>';
        for (const item of data) {
            xml += serialize(item);
        }
        xml += '</data></array>';
    } else if (type === 'object') {
        xml += '<struct>';
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                xml += `<member><name>${escapeXml(key)}</name>${serialize(data[key])}</member>`;
            }
        }
        xml += '</struct>';
    }

    xml += '</value>';
    return xml;
}

function escapeXml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Internal response parsing helpers ---

function XMLRPC_parseResponse(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    // Check for parser errors
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse XML response.");
    }

    // Check for XML-RPC Fault
    const fault = xmlDoc.getElementsByTagName('fault')[0];
    if (fault) {
        const faultStruct = parseValue(fault.getElementsByTagName('value')[0]);
        throw new Error(`XML-RPC Fault: ${faultStruct.faultString} (Code: ${faultStruct.faultCode})`);
    }

    // Parse the successful response
    const params = xmlDoc.getElementsByTagName('param');
    if (params.length > 0) {
        // Return the first parameter's value, which is standard for single-return calls
        return parseValue(params[0].getElementsByTagName('value')[0]);
    }

    // Fallback if no params are found, which is unusual for a valid response
    return null;
}

function parseValue(valueNode) {
    const child = valueNode.firstElementChild;
    if (!child) return valueNode.textContent; // For simple values with no type tag

    const type = child.tagName;

    switch (type) {
        case 'string':
            return child.textContent;
        case 'i4':
        case 'int':
            return parseInt(child.textContent, 10);
        case 'double':
            return parseFloat(child.textContent);
        case 'boolean':
            return child.textContent === '1';
        case 'dateTime.iso8601':
            return new Date(child.textContent);
        case 'nil':
            return null;
        case 'struct':
            const obj = {};
            const members = child.getElementsByTagName('member');
            for (const member of members) {
                const name = member.getElementsByTagName('name')[0].textContent;
                const value = parseValue(member.getElementsByTagName('value')[0]);
                obj[name] = value;
            }
            return obj;
        case 'array':
            const arr = [];
            const values = child.getElementsByTagName('data')[0].getElementsByTagName('value');
            for (const value of values) {
                arr.push(parseValue(value));
            }
            return arr;
        default:
            return child.textContent;
    }
}