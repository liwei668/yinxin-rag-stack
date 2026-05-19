import fetch from 'node-fetch';

async function testTTS() {
  console.log('=== 测试阿里云TTS API ===');

  const apiKey = 'sk-237b5a8ea8ca4fbc92fab068d567b323';
  const text = '你好，这是一个语音合成测试';

  // 使用正确的阿里云TTS API端点
  const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  const requestBody = {
    model: 'qwen3-tts-flash',
    input: {
      text: text,
      voice: 'Cherry',
      language_type: 'Chinese',
    },
  };

  console.log('API URL:', apiUrl);
  console.log('Text:', text);
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API error:', errorText);
      throw new Error(`TTS API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('TTS response keys:', Object.keys(data));
    console.log('TTS response:', JSON.stringify(data, null, 2));

    if (data.output?.audio?.url) {
      console.log('✅ Audio URL:', data.output.audio.url);

      // 下载音频
      const audioResponse = await fetch(data.output.audio.url);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.status}`);
      }
      const audioBuffer = await audioResponse.arrayBuffer();
      console.log('✅ Audio downloaded, size:', audioBuffer.byteLength);
    } else if (data.output?.audio?.data) {
      console.log('✅ Audio data received (base64)');
    } else {
      console.log('❌ No audio data in response');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testTTS();
