import fetch from 'node-fetch';

async function testAliyunTTS() {
  console.log('=== 测试阿里云TTS API ===');
  
  const apiKey = 'sk-237b5a8ea8ca4fbc92fab068d567b323';
  const text = '你好，这是一个语音合成测试';
  
  // 使用正确的阿里云TTS API端点
  const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/qwen3_tts_flash/invoke';
  
  const requestBody = {
    model: 'qwen3-tts-flash',
    input: {
      text: text
    },
    parameters: {
      voice: 'Chelsie',
      rate: 1.0,
      pitch: 1.0
    }
  };
  
  console.log('API URL:', apiUrl);
  console.log('Text:', text);
  console.log('Request body:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const responseText = await response.text();
    console.log('Response text:', responseText);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }
    
    const data = JSON.parse(responseText);
    console.log('Parsed response:', data);
    
    if (data.output && data.output.audio && data.output.audio.url) {
      console.log('✅ 成功获取音频URL:', data.output.audio.url);
      
      // 尝试下载音频
      try {
        const audioResponse = await fetch(data.output.audio.url, {
          timeout: 30000
        });
        
        if (!audioResponse.ok) {
          throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }
        
        const audioBuffer = await audioResponse.arrayBuffer();
        console.log('✅ 成功下载音频，大小:', audioBuffer.byteLength, 'bytes');
        console.log('测试成功！');
      } catch (downloadError) {
        console.error('❌ 音频下载失败:', downloadError);
      }
    } else {
      console.error('❌ 响应格式错误，没有找到音频URL');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testAliyunTTS();
